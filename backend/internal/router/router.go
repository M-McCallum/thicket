package router

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/handler"
	"github.com/M-McCallum/thicket/internal/ws"
)

type Config struct {
	AuthHandler    *handler.AuthHandler
	ServerHandler  *handler.ServerHandler
	MessageHandler *handler.MessageHandler
	DMHandler      *handler.DMHandler
	OryHandler     *handler.OryHandler
	JWTManager     *auth.JWTManager
	JWKSManager    *auth.JWKSManager
	Hub            *ws.Hub
	CORSOrigin     string
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
		oryAuth.Post("/login", cfg.OryHandler.PostLogin)
		oryAuth.Get("/consent", cfg.OryHandler.GetConsent)
		oryAuth.Get("/logout", cfg.OryHandler.GetLogout)
	}

	api := app.Group("/api")

	// Auth routes (rate limited)
	authGroup := api.Group("/auth")
	authGroup.Use(limiter.New(limiter.Config{
		Max:        5,
		Expiration: 15 * time.Minute,
	}))
	authGroup.Post("/signup", cfg.AuthHandler.Signup)
	authGroup.Post("/login", cfg.AuthHandler.Login)
	authGroup.Post("/refresh", cfg.AuthHandler.Refresh)
	authGroup.Post("/logout", cfg.AuthHandler.Logout)

	// Protected routes
	protected := api.Group("", auth.DualMiddleware(cfg.JWTManager, cfg.JWKSManager))

	// User
	protected.Get("/me", cfg.AuthHandler.Me)

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

	// WebSocket
	app.Get("/ws", ws.Handler(cfg.Hub, cfg.JWTManager))
}
