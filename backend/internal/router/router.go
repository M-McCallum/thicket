package router

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/handler"
	"github.com/M-McCallum/thicket/internal/ws"
)

type Config struct {
	ServerHandler      *handler.ServerHandler
	MessageHandler     *handler.MessageHandler
	DMHandler          *handler.DMHandler
	OryHandler         *handler.OryHandler
	LiveKitHandler     *handler.LiveKitHandler
	JWKSManager        *auth.JWKSManager
	Hub                *ws.Hub
	CoMemberIDsFn      ws.CoMemberIDsFn
	ServerMemberIDsFn  ws.ServerMemberIDsFn
	CORSOrigin         string
}

func Setup(app *fiber.App, cfg Config) {
	// Global middleware
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{cfg.CORSOrigin},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
	}))

	// Health check
	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Ory Hydra provider endpoints (no auth middleware)
	if cfg.OryHandler != nil {
		oryAuth := app.Group("/auth")
		oryAuth.Get("/login", cfg.OryHandler.GetLogin)
		oryAuth.Get("/registration", cfg.OryHandler.GetRegistration)
		oryAuth.Get("/consent", cfg.OryHandler.GetConsent)
		oryAuth.Get("/logout", cfg.OryHandler.GetLogout)
		oryAuth.Get("/error", cfg.OryHandler.GetError)
	}

	api := app.Group("/api")

	// Protected routes
	protected := api.Group("", auth.Middleware(cfg.JWKSManager))

	// User
	protected.Get("/me", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":  auth.GetUserID(c),
			"username": auth.GetUsername(c),
		})
	})

	// Servers
	protected.Get("/servers", cfg.ServerHandler.GetUserServers)
	protected.Post("/servers", cfg.ServerHandler.CreateServer)
	protected.Get("/servers/:id", cfg.ServerHandler.GetServer)
	protected.Delete("/servers/:id", cfg.ServerHandler.DeleteServer)
	protected.Post("/servers/join", cfg.ServerHandler.JoinServer)
	protected.Post("/servers/:id/leave", cfg.ServerHandler.LeaveServer)
	protected.Get("/servers/:id/members", cfg.ServerHandler.GetMembers)

	// Channels
	protected.Post("/servers/:id/channels", cfg.ServerHandler.CreateChannel)
	protected.Get("/servers/:id/channels", cfg.ServerHandler.GetChannels)
	protected.Delete("/servers/:id/channels/:channelId", cfg.ServerHandler.DeleteChannel)

	// Messages
	protected.Post("/channels/:channelId/messages", cfg.MessageHandler.SendMessage)
	protected.Get("/channels/:channelId/messages", cfg.MessageHandler.GetMessages)
	protected.Put("/messages/:id", cfg.MessageHandler.UpdateMessage)
	protected.Delete("/messages/:id", cfg.MessageHandler.DeleteMessage)

	// Direct Messages
	protected.Post("/dm/conversations", cfg.DMHandler.CreateConversation)
	protected.Get("/dm/conversations", cfg.DMHandler.GetConversations)
	protected.Get("/dm/conversations/:id/messages", cfg.DMHandler.GetDMMessages)
	protected.Post("/dm/conversations/:id/messages", cfg.DMHandler.SendDM)

	// Voice
	if cfg.LiveKitHandler != nil {
		protected.Post("/servers/:serverId/channels/:channelId/voice-token", cfg.LiveKitHandler.GetVoiceToken)
	}

	// WebSocket
	app.Get("/ws", ws.Handler(cfg.Hub, cfg.JWKSManager, cfg.CoMemberIDsFn, cfg.ServerMemberIDsFn))
}
