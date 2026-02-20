package ws

import (
	"context"
	"encoding/json"
	"log"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/valyala/fasthttp"

	"github.com/M-McCallum/thicket/internal/auth"
)

var upgrader = websocket.FastHTTPUpgrader{
	CheckOrigin: func(ctx *fasthttp.RequestCtx) bool {
		return true // Origin check handled by CORS middleware
	},
}

// CoMemberIDsFn returns all distinct user IDs that share any server with the given user.
type CoMemberIDsFn func(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error)

// ServerMemberIDsFn returns all user IDs in a given server.
type ServerMemberIDsFn func(ctx context.Context, serverID uuid.UUID) ([]uuid.UUID, error)

// DMParticipantIDsFn returns user IDs for a DM conversation.
type DMParticipantIDsFn func(ctx context.Context, conversationID uuid.UUID) ([]uuid.UUID, error)

// HandlerOpts are optional dependencies for the WS handler.
var HandlerDMParticipantsFn DMParticipantIDsFn

func Handler(hub *Hub, jwksManager *auth.JWKSManager, coMemberIDsFn CoMemberIDsFn, serverMemberIDsFn ...ServerMemberIDsFn) fiber.Handler {
	return func(c fiber.Ctx) error {
		fctx, ok := c.(interface{ RequestCtx() *fasthttp.RequestCtx })
		if !ok {
			return fiber.ErrInternalServerError
		}
		return upgrader.Upgrade(fctx.RequestCtx(), func(conn *websocket.Conn) {
			defer conn.Close()

			// Client must send IDENTIFY with JWT first
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}

			var event Event
			if err := json.Unmarshal(msg, &event); err != nil {
				return
			}

			if event.Type != EventIdentify {
				return
			}

			var identify IdentifyData
			if err := json.Unmarshal(event.Data, &identify); err != nil {
				return
			}

			claims, err := jwksManager.ValidateToken(identify.Token)
			if err != nil {
				return
			}

			log.Printf("WebSocket authenticated: %s (%s)", claims.Ext.Username, claims.Ext.UserID)

			client := NewClient(hub, conn, claims.Ext.UserID, claims.Ext.Username)
			client.jwksManager = jwksManager
			if len(serverMemberIDsFn) > 0 && serverMemberIDsFn[0] != nil {
				fn := serverMemberIDsFn[0]
				client.GetMemberIDsFn = func(serverID string) ([]uuid.UUID, error) {
					sid, err := uuid.Parse(serverID)
					if err != nil {
						return nil, err
					}
					return fn(context.Background(), sid)
				}
			}
			if HandlerDMParticipantsFn != nil {
				dmFn := HandlerDMParticipantsFn
				client.GetDMParticipantsFn = func(conversationID string) ([]uuid.UUID, error) {
					cid, err := uuid.Parse(conversationID)
					if err != nil {
						return nil, err
					}
					return dmFn(context.Background(), cid)
				}
			}
			hub.Register(client)

			// Build READY payload with online users
			onlineUsers := hub.GetOnlineUsers()
			onlineIDs := make([]string, len(onlineUsers))
			for i, id := range onlineUsers {
				onlineIDs[i] = id.String()
			}

			readyEvent, _ := NewEvent(EventReady, ReadyData{
				UserID:        claims.Ext.UserID.String(),
				Username:      claims.Ext.Username,
				OnlineUserIDs: onlineIDs,
			})
			if readyEvent != nil {
				if data, err := json.Marshal(readyEvent); err == nil {
					client.send <- data
				}
			}

			// Broadcast presence "online" to co-members
			if coMemberIDsFn != nil {
				go func() {
					coMemberIDs, err := coMemberIDsFn(context.Background(), claims.Ext.UserID)
					if err != nil {
						log.Printf("Failed to get co-member IDs for presence: %v", err)
						return
					}
					presenceEvent, _ := NewEvent(EventPresenceUpdBcast, PresenceData{
						UserID:   claims.Ext.UserID.String(),
						Username: claims.Ext.Username,
						Status:   "online",
					})
					if presenceEvent != nil {
						BroadcastToServerMembers(hub, coMemberIDs, presenceEvent, nil)
					}
				}()
			}

			go client.WritePump()
			client.ReadPump()
		})
	}
}
