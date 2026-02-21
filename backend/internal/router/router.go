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
	ServerHandler      *handler.ServerHandler
	MessageHandler     *handler.MessageHandler
	DMHandler          *handler.DMHandler
	OryHandler         *handler.OryHandler
	LiveKitHandler     *handler.LiveKitHandler
	UserHandler        *handler.UserHandler
	EmojiHandler       *handler.EmojiHandler
	GifHandler         *handler.GifHandler
	StickerHandler     *handler.StickerHandler
	FriendHandler      *handler.FriendHandler
	RoleHandler        *handler.RoleHandler
	LinkPreviewHandler *handler.LinkPreviewHandler
	SearchHandler      *handler.SearchHandler
	AttachmentHandler  *handler.AttachmentHandler
	ModerationHandler  *handler.ModerationHandler
	ThreadHandler      *handler.ThreadHandler
	EventHandler       *handler.EventHandler
	PollHandler        *handler.PollHandler
	InviteHandler          *handler.InviteHandler
	ReadStateHandler       *handler.ReadStateHandler
	NotificationPrefHandler *handler.NotificationPrefHandler
	ScheduleHandler         *handler.ScheduleHandler
	UserPrefHandler         *handler.UserPrefHandler
	ServerFolderHandler     *handler.ServerFolderHandler
	JWKSManager        *auth.JWKSManager
	Hub                *ws.Hub
	CoMemberIDsFn      ws.CoMemberIDsFn
	ServerMemberIDsFn  ws.ServerMemberIDsFn
	CORSOrigin         string
	StorageClient      *storage.Client
	TenorAPIKey        string
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

	// File proxy routes (public — no auth, registered on app directly
	// because Fiber v3 group middleware bleeds to sibling routes)
	if cfg.AttachmentHandler != nil {
		app.Get("/api/attachments/:id/:filename", cfg.AttachmentHandler.ServeAttachment)
		app.Get("/api/files/+", cfg.AttachmentHandler.ServeFile)
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

	// Invites & Discovery
	if cfg.InviteHandler != nil {
		protected.Post("/servers/:id/invites", cfg.InviteHandler.CreateInvite)
		protected.Get("/servers/:id/invites", cfg.InviteHandler.ListInvites)
		protected.Delete("/servers/:id/invites/:inviteId", cfg.InviteHandler.DeleteInvite)
		protected.Post("/servers/join/invite", cfg.InviteHandler.UseInvite)
		protected.Get("/servers/discover", cfg.InviteHandler.DiscoverServers)
	}

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
	protected.Get("/channels/:channelId/messages/around", cfg.MessageHandler.GetMessagesAround)
	protected.Put("/messages/:id", cfg.MessageHandler.UpdateMessage)
	protected.Delete("/messages/:id", cfg.MessageHandler.DeleteMessage)

	// Pins
	protected.Put("/channels/:channelId/pins/:messageId", cfg.MessageHandler.PinMessage)
	protected.Delete("/channels/:channelId/pins/:messageId", cfg.MessageHandler.UnpinMessage)
	protected.Get("/channels/:channelId/pins", cfg.MessageHandler.GetPinnedMessages)

	// Reactions (emoji passed as query param ?emoji=...)
	protected.Put("/messages/:id/reactions", cfg.MessageHandler.AddReaction)
	protected.Delete("/messages/:id/reactions", cfg.MessageHandler.RemoveReaction)

	// Edit history
	protected.Get("/messages/:id/edits", cfg.MessageHandler.GetEditHistory)

	// Roles
	if cfg.RoleHandler != nil {
		protected.Get("/servers/:id/roles", cfg.RoleHandler.GetRoles)
		protected.Post("/servers/:id/roles", cfg.RoleHandler.CreateRole)
		protected.Patch("/servers/:id/roles/:roleId", cfg.RoleHandler.UpdateRole)
		protected.Delete("/servers/:id/roles/:roleId", cfg.RoleHandler.DeleteRole)
		protected.Put("/servers/:id/roles/reorder", cfg.RoleHandler.ReorderRoles)
		protected.Put("/servers/:id/members/:userId/roles/:roleId", cfg.RoleHandler.AssignRole)
		protected.Delete("/servers/:id/members/:userId/roles/:roleId", cfg.RoleHandler.RemoveRoleFromMember)
		protected.Get("/servers/:id/channels/:channelId/permissions", cfg.RoleHandler.GetChannelOverrides)
		protected.Put("/servers/:id/channels/:channelId/permissions/:roleId", cfg.RoleHandler.SetChannelOverride)
		protected.Delete("/servers/:id/channels/:channelId/permissions/:roleId", cfg.RoleHandler.DeleteChannelOverride)
		protected.Get("/servers/:id/members-with-roles", cfg.RoleHandler.GetMembersWithRoles)
	}

	// Events
	if cfg.EventHandler != nil {
		protected.Post("/servers/:id/events", cfg.EventHandler.CreateEvent)
		protected.Get("/servers/:id/events", cfg.EventHandler.GetServerEvents)
		protected.Get("/servers/:id/events/:eventId", cfg.EventHandler.GetEvent)
		protected.Patch("/servers/:id/events/:eventId", cfg.EventHandler.UpdateEvent)
		protected.Delete("/servers/:id/events/:eventId", cfg.EventHandler.DeleteEvent)
		protected.Post("/servers/:id/events/:eventId/rsvp", cfg.EventHandler.RSVP)
		protected.Delete("/servers/:id/events/:eventId/rsvp", cfg.EventHandler.RemoveRSVP)
	}

	// Polls
	if cfg.PollHandler != nil {
		protected.Post("/channels/:channelId/polls", cfg.PollHandler.CreatePoll)
		protected.Get("/polls/:id", cfg.PollHandler.GetPoll)
		protected.Post("/polls/:id/vote", cfg.PollHandler.Vote)
		protected.Delete("/polls/:id/vote/:optionId", cfg.PollHandler.RemoveVote)
	}

	// Search
	if cfg.SearchHandler != nil {
		protected.Get("/search/messages", cfg.SearchHandler.SearchMessages)
		protected.Get("/search/dm", cfg.SearchHandler.SearchDMMessages)
	}

	// Link previews
	if cfg.LinkPreviewHandler != nil {
		protected.Get("/link-preview", cfg.LinkPreviewHandler.GetLinkPreview)
	}

	// Direct Messages
	protected.Post("/dm/conversations", cfg.DMHandler.CreateConversation)
	protected.Post("/dm/conversations/group", cfg.DMHandler.CreateGroupConversation)
	protected.Get("/dm/conversations", cfg.DMHandler.GetConversations)
	protected.Get("/dm/conversations/:id/messages", cfg.DMHandler.GetDMMessages)
	protected.Get("/dm/conversations/:id/messages/around", cfg.DMHandler.GetDMMessagesAround)
	protected.Post("/dm/conversations/:id/messages", cfg.DMHandler.SendDM)
	protected.Post("/dm/conversations/:id/accept", cfg.DMHandler.AcceptRequest)
	protected.Post("/dm/conversations/:id/decline", cfg.DMHandler.DeclineRequest)
	protected.Post("/dm/conversations/:id/participants", cfg.DMHandler.AddParticipant)
	protected.Delete("/dm/conversations/:id/participants/:userId", cfg.DMHandler.RemoveParticipant)
	protected.Patch("/dm/conversations/:id", cfg.DMHandler.RenameConversation)
	protected.Put("/dm/messages/:id", cfg.DMHandler.EditDMMessage)
	protected.Delete("/dm/messages/:id", cfg.DMHandler.DeleteDMMessage)
	protected.Put("/dm/messages/:id/reactions", cfg.DMHandler.AddDMReaction)
	protected.Delete("/dm/messages/:id/reactions", cfg.DMHandler.RemoveDMReaction)
	protected.Get("/dm/messages/:id/edits", cfg.DMHandler.GetDMEditHistory)
	protected.Put("/dm/conversations/:id/pins/:messageId", cfg.DMHandler.PinDMMessage)
	protected.Delete("/dm/conversations/:id/pins/:messageId", cfg.DMHandler.UnpinDMMessage)
	protected.Get("/dm/conversations/:id/pins", cfg.DMHandler.GetDMPinnedMessages)

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

	// Moderation
	if cfg.ModerationHandler != nil {
		protected.Post("/servers/:id/bans", cfg.ModerationHandler.BanUser)
		protected.Get("/servers/:id/bans", cfg.ModerationHandler.GetBans)
		protected.Delete("/servers/:id/bans/:userId", cfg.ModerationHandler.UnbanUser)
		protected.Post("/servers/:id/kick/:userId", cfg.ModerationHandler.KickUser)
		protected.Post("/servers/:id/timeout/:userId", cfg.ModerationHandler.TimeoutUser)
		protected.Delete("/servers/:id/timeout/:userId", cfg.ModerationHandler.RemoveTimeout)
		protected.Get("/servers/:id/timeouts", cfg.ModerationHandler.GetTimeouts)
		protected.Get("/servers/:id/audit-log", cfg.ModerationHandler.GetAuditLog)
	}

	// Friends
	if cfg.FriendHandler != nil {
		protected.Get("/friends", cfg.FriendHandler.GetFriends)
		protected.Get("/friends/requests", cfg.FriendHandler.GetPendingRequests)
		protected.Post("/friends/request", cfg.FriendHandler.SendRequest)
		protected.Post("/friends/:id/accept", cfg.FriendHandler.AcceptRequest)
		protected.Post("/friends/:id/decline", cfg.FriendHandler.DeclineRequest)
		protected.Delete("/friends/:id", cfg.FriendHandler.RemoveFriend)
		protected.Get("/users/blocked", cfg.FriendHandler.GetBlockedUsers)
		protected.Post("/users/:id/block", cfg.FriendHandler.BlockUser)
		protected.Delete("/users/:id/block", cfg.FriendHandler.UnblockUser)
	}

	// Threads
	if cfg.ThreadHandler != nil {
		protected.Post("/channels/:channelId/threads", cfg.ThreadHandler.CreateThread)
		protected.Get("/channels/:channelId/threads", cfg.ThreadHandler.ListThreads)
		protected.Get("/threads/:threadId", cfg.ThreadHandler.GetThread)
		protected.Patch("/threads/:threadId", cfg.ThreadHandler.UpdateThread)
		protected.Post("/threads/:threadId/messages", cfg.ThreadHandler.SendMessage)
		protected.Get("/threads/:threadId/messages", cfg.ThreadHandler.GetMessages)
		protected.Put("/threads/:threadId/subscription", cfg.ThreadHandler.UpdateSubscription)
	}

	// Read state
	if cfg.ReadStateHandler != nil {
		protected.Post("/channels/:channelId/ack", cfg.ReadStateHandler.AckChannel)
		protected.Post("/dm/conversations/:id/ack", cfg.ReadStateHandler.AckDM)
		protected.Get("/me/unread", cfg.ReadStateHandler.GetUnread)
	}

	// Notification preferences
	if cfg.NotificationPrefHandler != nil {
		protected.Get("/me/notification-prefs", cfg.NotificationPrefHandler.GetPrefs)
		protected.Put("/me/notification-prefs/:scopeType/:scopeId", cfg.NotificationPrefHandler.SetPref)
	}

	// Scheduled Messages
	if cfg.ScheduleHandler != nil {
		protected.Get("/me/scheduled-messages", cfg.ScheduleHandler.ListScheduledMessages)
		protected.Post("/me/scheduled-messages", cfg.ScheduleHandler.CreateScheduledMessage)
		protected.Patch("/me/scheduled-messages/:id", cfg.ScheduleHandler.UpdateScheduledMessage)
		protected.Delete("/me/scheduled-messages/:id", cfg.ScheduleHandler.DeleteScheduledMessage)
	}

	// User preferences
	if cfg.UserPrefHandler != nil {
		protected.Get("/me/preferences", cfg.UserPrefHandler.GetPreferences)
		protected.Patch("/me/preferences", cfg.UserPrefHandler.UpdatePreferences)
	}

	// Server folders
	if cfg.ServerFolderHandler != nil {
		protected.Get("/me/server-folders", cfg.ServerFolderHandler.ListFolders)
		protected.Post("/me/server-folders", cfg.ServerFolderHandler.CreateFolder)
		protected.Patch("/me/server-folders/:id", cfg.ServerFolderHandler.UpdateFolder)
		protected.Delete("/me/server-folders/:id", cfg.ServerFolderHandler.DeleteFolder)
		protected.Put("/me/server-folders/:id/servers/:serverId", cfg.ServerFolderHandler.AddServerToFolder)
		protected.Delete("/me/server-folders/:id/servers/:serverId", cfg.ServerFolderHandler.RemoveServerFromFolder)
	}

	// WebSocket
	app.Get("/ws", ws.Handler(cfg.Hub, cfg.JWKSManager, cfg.CoMemberIDsFn, cfg.ServerMemberIDsFn))
}
