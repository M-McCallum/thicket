package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 45 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 4096
	sendBufferSize = 256
)

const CloseSessionExpired = 4001

type Client struct {
	Hub         *Hub
	conn        *websocket.Conn
	UserID      uuid.UUID
	Username    string
	send        chan []byte
	jwksManager *auth.JWKSManager
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
		recover() // Ignore panics from writes to closed connections
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

func (c *Client) handleTokenRefresh(token string) {
	claims, err := c.jwksManager.ValidateToken(token)
	if err != nil || claims.Ext.UserID != c.UserID {
		expiredEvent, _ := NewEvent(EventSessionExpired, map[string]string{
			"reason": "invalid_token",
		})
		if expiredEvent != nil {
			if data, err := json.Marshal(expiredEvent); err == nil {
				c.send <- data
			}
		}
		c.conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(CloseSessionExpired, "session expired"))
		return
	}

	c.Username = claims.Ext.Username
	log.Printf("WebSocket token refreshed: %s (%s)", c.Username, c.UserID)
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

	case EventTokenRefresh:
		var data TokenRefreshData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		c.handleTokenRefresh(data.Token)
	}
}
