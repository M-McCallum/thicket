package ws

import (
	"encoding/json"
	"log"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/valyala/fasthttp"

	"github.com/M-McCallum/thicket/internal/auth"
)

var upgrader = websocket.FastHTTPUpgrader{
	CheckOrigin: func(ctx *fasthttp.RequestCtx) bool {
		return true // Origin check handled by CORS middleware
	},
}

func Handler(hub *Hub, jwtManager *auth.JWTManager) fiber.Handler {
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

			claims, err := jwtManager.ValidateToken(identify.Token)
			if err != nil {
				return
			}

			log.Printf("WebSocket authenticated: %s (%s)", claims.Username, claims.UserID)

			client := NewClient(hub, conn, claims.UserID, claims.Username)
			hub.Register(client)

			// Send READY directly to client's send buffer to avoid race
			// with hub registration (hub.Register is async).
			readyEvent, _ := NewEvent(EventReady, map[string]string{
				"user_id":  claims.UserID.String(),
				"username": claims.Username,
			})
			if readyEvent != nil {
				if data, err := json.Marshal(readyEvent); err == nil {
					client.send <- data
				}
			}

			go client.WritePump()
			client.ReadPump()
		})
	}
}
