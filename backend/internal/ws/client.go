package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/google/uuid"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 45 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 4096
	sendBufferSize = 256
)

type Client struct {
	Hub      *Hub
	conn     *websocket.Conn
	UserID   uuid.UUID
	Username string
	send     chan []byte
}

func NewClient(hub *Hub, conn *websocket.Conn, userID uuid.UUID, username string) *Client {
	return &Client{
		Hub:      hub,
		conn:     conn,
		UserID:   userID,
		Username: username,
		send:     make(chan []byte, sendBufferSize),
	}
}

// Alias for backward compatibility with handler.go
func NewClientFromFastHTTP(hub *Hub, conn *websocket.Conn, userID uuid.UUID, username string) *Client {
	return NewClient(hub, conn, userID, username)
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var event Event
		if err := json.Unmarshal(message, &event); err != nil {
			continue
		}

		c.handleEvent(&event)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Aliases for the handler that uses FastHTTP naming
func (c *Client) ReadPumpFastHTTP() {
	c.ReadPump()
}

func (c *Client) WritePumpFastHTTP() {
	c.WritePump()
}

func (c *Client) handleEvent(event *Event) {
	switch event.Type {
	case EventHeartbeat:
		ack, err := NewEvent(EventHeartbeatAck, nil)
		if err != nil {
			return
		}
		c.Hub.SendToUser(c.UserID, ack)

	case EventSubscribe:
		var data SubscribeData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		c.Hub.Subscribe(c.UserID, data.ChannelID)
		log.Printf("User %s subscribed to channel %s", c.Username, data.ChannelID)

	case EventUnsubscribe:
		var data SubscribeData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		c.Hub.Unsubscribe(c.UserID, data.ChannelID)

	case EventTypingStart:
		var data TypingData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		data.UserID = c.UserID.String()
		data.Username = c.Username

		bcastEvent, err := NewEvent(EventTypingStartBcast, data)
		if err != nil {
			return
		}
		c.Hub.BroadcastToChannel(data.ChannelID, bcastEvent, &c.UserID)
	}
}
