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

// GetMemberIDsFn fetches member user IDs for a given server ID.
type GetMemberIDsFn func(serverID string) ([]uuid.UUID, error)

// GetDMParticipantsFn fetches participant user IDs for a DM conversation.
type GetDMParticipantsFn func(conversationID string) ([]uuid.UUID, error)

type Client struct {
	Hub                  *Hub
	conn                 *websocket.Conn
	UserID               uuid.UUID
	Username             string
	send                 chan []byte
	jwksManager          *auth.JWKSManager
	GetMemberIDsFn       GetMemberIDsFn
	GetDMParticipantsFn  GetDMParticipantsFn
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

	case EventVoiceJoin:
		var data VoiceJoinData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		state := VoiceState{
			UserID:    c.UserID,
			ChannelID: data.ChannelID,
			ServerID:  data.ServerID,
			Username:  c.Username,
		}
		c.Hub.JoinVoiceChannel(state)
		log.Printf("User %s joined voice channel %s", c.Username, data.ChannelID)

		// Broadcast VOICE_STATE_UPDATE to server members
		if c.GetMemberIDsFn != nil {
			if memberIDs, err := c.GetMemberIDsFn(data.ServerID); err == nil {
				bcastEvent, _ := NewEvent(EventVoiceStateUpdate, VoiceStateData{
					UserID:    c.UserID.String(),
					Username:  c.Username,
					ChannelID: data.ChannelID,
					ServerID:  data.ServerID,
					Joined:    true,
				})
				if bcastEvent != nil {
					BroadcastToServerMembers(c.Hub, memberIDs, bcastEvent, nil)
				}
			}
		}

	case EventVoiceLeave:
		var data VoiceLeaveData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		c.Hub.LeaveVoiceChannel(c.UserID, data.ChannelID)
		log.Printf("User %s left voice channel %s", c.Username, data.ChannelID)

		if c.GetMemberIDsFn != nil {
			if memberIDs, err := c.GetMemberIDsFn(data.ServerID); err == nil {
				bcastEvent, _ := NewEvent(EventVoiceStateUpdate, VoiceStateData{
					UserID:    c.UserID.String(),
					Username:  c.Username,
					ChannelID: data.ChannelID,
					ServerID:  data.ServerID,
					Joined:    false,
				})
				if bcastEvent != nil {
					BroadcastToServerMembers(c.Hub, memberIDs, bcastEvent, nil)
				}
			}
		}

	case EventTokenRefresh:
		var data TokenRefreshData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		c.handleTokenRefresh(data.Token)

	case EventDMCallStart:
		var data DMCallData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		// Get DM participants and send ring event to the other participant(s)
		if c.GetDMParticipantsFn != nil {
			if participantIDs, err := c.GetDMParticipantsFn(data.ConversationID); err == nil {
				ringEvent, _ := NewEvent(EventDMCallRing, map[string]string{
					"conversation_id": data.ConversationID,
					"caller_id":       c.UserID.String(),
					"caller_username": c.Username,
				})
				if ringEvent != nil {
					for _, pid := range participantIDs {
						if pid != c.UserID {
							c.Hub.SendToUser(pid, ringEvent)
						}
					}
				}
			}
		}

	case EventDMCallAccept:
		var data DMCallData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		if c.GetDMParticipantsFn != nil {
			if participantIDs, err := c.GetDMParticipantsFn(data.ConversationID); err == nil {
				acceptEvent, _ := NewEvent(EventDMCallAcceptBcast, map[string]string{
					"conversation_id": data.ConversationID,
					"user_id":         c.UserID.String(),
					"username":        c.Username,
				})
				if acceptEvent != nil {
					for _, pid := range participantIDs {
						if pid != c.UserID {
							c.Hub.SendToUser(pid, acceptEvent)
						}
					}
				}
			}
		}

	case EventDMCallEnd:
		var data DMCallData
		if err := json.Unmarshal(event.Data, &data); err != nil {
			return
		}
		if c.GetDMParticipantsFn != nil {
			if participantIDs, err := c.GetDMParticipantsFn(data.ConversationID); err == nil {
				endEvent, _ := NewEvent(EventDMCallEndBcast, map[string]string{
					"conversation_id": data.ConversationID,
					"user_id":         c.UserID.String(),
				})
				if endEvent != nil {
					for _, pid := range participantIDs {
						if pid != c.UserID {
							c.Hub.SendToUser(pid, endEvent)
						}
					}
				}
			}
		}
	}
}
