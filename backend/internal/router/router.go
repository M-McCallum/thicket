package router

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/handler"
	"github.com/M-McCallum/thicket/internal/storage"
	"github.com/M-McCallum/thicket/internal/ws"
)

type Config struct {
	ServerHandler     *handler.ServerHandler
	MessageHandler    *handler.MessageHandler
	DMHandler         *handler.DMHandler
	OryHandler        *handler.OryHandler
	LiveKitHandler    *handler.LiveKitHandler
	UserHandler       *handler.UserHandler
	EmojiHandler      *handler.EmojiHandler
	GifHandler        *handler.GifHandler
	StickerHandler    *handler.StickerHandler
	FriendHandler     *handler.FriendHandler
	JWKSManager       *auth.JWKSManager
	Hub               *ws.Hub
	CoMemberIDsFn     ws.CoMemberIDsFn
	ServerMemberIDsFn ws.ServerMemberIDsFn
	CORSOrigin        string
	StorageClient     *storage.Client
	TenorAPIKey       string
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

	// Public routes (no auth)
	if cfg.ServerHandler != nil {
		api.Get("/servers/invite/:code/preview", cfg.ServerHandler.GetServerPreview)
	}

	// Protected routes
	protected := api.Group("", auth.Middleware(cfg.JWKSManager))

	// User
	protected.Get("/me", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":  auth.GetUserID(c),
			"username": auth.GetUsername(c),
		})
	})

	// User profile
	if cfg.UserHandler != nil {
		protected.Get("/me/profile", cfg.UserHandler.GetMyProfile)
		protected.Patch("/me/profile", cfg.UserHandler.UpdateProfile)
		protected.Put("/me/status", cfg.UserHandler.UpdateStatus)
		protected.Put("/me/custom-status", cfg.UserHandler.UpdateCustomStatus)
		protected.Post("/me/avatar", cfg.UserHandler.UploadAvatar)
		protected.Delete("/me/avatar", cfg.UserHandler.DeleteAvatar)
		protected.Get("/users/:id/profile", cfg.UserHandler.GetPublicProfile)
	}

	// Servers
	protected.Get("/servers", cfg.ServerHandler.GetUserServers)
	protected.Post("/servers", cfg.ServerHandler.CreateServer)
	protected.Get("/servers/:id", cfg.ServerHandler.GetServer)
	protected.Patch("/servers/:id", cfg.ServerHandler.UpdateServer)
	protected.Delete("/servers/:id", cfg.ServerHandler.DeleteServer)
	protected.Post("/servers/join", cfg.ServerHandler.JoinServer)
	protected.Post("/servers/:id/leave", cfg.ServerHandler.LeaveServer)
	protected.Get("/servers/:id/members", cfg.ServerHandler.GetMembers)
	protected.Patch("/servers/:id/members/me/nickname", cfg.ServerHandler.SetNickname)

	// Channels
	protected.Post("/servers/:id/channels", cfg.ServerHandler.CreateChannel)
	protected.Get("/servers/:id/channels", cfg.ServerHandler.GetChannels)
	protected.Patch("/servers/:id/channels/:channelId", cfg.ServerHandler.UpdateChannel)
	protected.Delete("/servers/:id/channels/:channelId", cfg.ServerHandler.DeleteChannel)

	// Categories
	protected.Post("/servers/:id/categories", cfg.ServerHandler.CreateCategory)
	protected.Get("/servers/:id/categories", cfg.ServerHandler.GetCategories)
	protected.Patch("/servers/:id/categories/:categoryId", cfg.ServerHandler.UpdateCategory)
	protected.Delete("/servers/:id/categories/:categoryId", cfg.ServerHandler.DeleteCategory)

	// Messages
	protected.Post("/channels/:channelId/messages", cfg.MessageHandler.SendMessage)
	protected.Get("/channels/:channelId/messages", cfg.MessageHandler.GetMessages)
	protected.Put("/messages/:id", cfg.MessageHandler.UpdateMessage)
	protected.Delete("/messages/:id", cfg.MessageHandler.DeleteMessage)

	// Pins
	protected.Put("/channels/:channelId/pins/:messageId", cfg.MessageHandler.PinMessage)
	protected.Delete("/channels/:channelId/pins/:messageId", cfg.MessageHandler.UnpinMessage)
	protected.Get("/channels/:channelId/pins", cfg.MessageHandler.GetPinnedMessages)

	// Reactions (emoji passed as query param ?emoji=...)
	protected.Put("/messages/:id/reactions", cfg.MessageHandler.AddReaction)
	protected.Delete("/messages/:id/reactions", cfg.MessageHandler.RemoveReaction)

	// Direct Messages
	protected.Post("/dm/conversations", cfg.DMHandler.CreateConversation)
	protected.Get("/dm/conversations", cfg.DMHandler.GetConversations)
	protected.Get("/dm/conversations/:id/messages", cfg.DMHandler.GetDMMessages)
	protected.Post("/dm/conversations/:id/messages", cfg.DMHandler.SendDM)

	// Voice
	if cfg.LiveKitHandler != nil {
		protected.Post("/servers/:serverId/channels/:channelId/voice-token", cfg.LiveKitHandler.GetVoiceToken)
		protected.Post("/dm/conversations/:id/voice-token", cfg.LiveKitHandler.GetDMVoiceToken)
	}

	// Custom Emojis
	if cfg.EmojiHandler != nil {
		protected.Get("/servers/:id/emojis", cfg.EmojiHandler.GetServerEmojis)
		protected.Post("/servers/:id/emojis", cfg.EmojiHandler.CreateEmoji)
		protected.Delete("/servers/:id/emojis/:emojiId", cfg.EmojiHandler.DeleteEmoji)
	}

	// GIFs
	if cfg.GifHandler != nil {
		protected.Get("/gifs/search", cfg.GifHandler.Search)
		protected.Get("/gifs/trending", cfg.GifHandler.Trending)
	}

	// Stickers
	if cfg.StickerHandler != nil {
		protected.Get("/sticker-packs", cfg.StickerHandler.GetPacks)
		protected.Get("/sticker-packs/:id/stickers", cfg.StickerHandler.GetStickers)
		protected.Post("/servers/:id/sticker-packs", cfg.StickerHandler.CreatePack)
		protected.Post("/sticker-packs/:id/stickers", cfg.StickerHandler.CreateSticker)
		protected.Delete("/stickers/:id", cfg.StickerHandler.DeleteSticker)
	}

	// Friends
	if cfg.FriendHandler != nil {
		protected.Get("/friends", cfg.FriendHandler.GetFriends)
		protected.Get("/friends/requests", cfg.FriendHandler.GetPendingRequests)
		protected.Post("/friends/request", cfg.FriendHandler.SendRequest)
		protected.Post("/friends/:id/accept", cfg.FriendHandler.AcceptRequest)
		protected.Post("/friends/:id/decline", cfg.FriendHandler.DeclineRequest)
		protected.Delete("/friends/:id", cfg.FriendHandler.RemoveFriend)
		protected.Post("/users/:id/block", cfg.FriendHandler.BlockUser)
		protected.Delete("/users/:id/block", cfg.FriendHandler.UnblockUser)
	}

	// WebSocket
	app.Get("/ws", ws.Handler(cfg.Hub, cfg.JWKSManager, cfg.CoMemberIDsFn, cfg.ServerMemberIDsFn))
}
