package router

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/handler"
	"github.com/M-McCallum/thicket/internal/middleware"
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

	FriendHandler      *handler.FriendHandler
	RoleHandler        *handler.RoleHandler
	LinkPreviewHandler *handler.LinkPreviewHandler
	SearchHandler      *handler.SearchHandler
	AttachmentHandler  *handler.AttachmentHandler
	ModerationHandler  *handler.ModerationHandler
	ThreadHandler      *handler.ThreadHandler
	PollHandler        *handler.PollHandler
	InviteHandler          *handler.InviteHandler
	ReadStateHandler       *handler.ReadStateHandler
	NotificationPrefHandler *handler.NotificationPrefHandler
	ScheduleHandler         *handler.ScheduleHandler
	UserPrefHandler         *handler.UserPrefHandler
	ServerFolderHandler      *handler.ServerFolderHandler
	ForumHandler             *handler.ForumHandler
	OnboardingHandler        *handler.OnboardingHandler
	ChannelFollowHandler     *handler.ChannelFollowHandler
	AutoModHandler           *handler.AutoModHandler
	StageHandler       *handler.StageHandler
	SoundboardHandler  *handler.SoundboardHandler
	BotHandler         *handler.BotHandler
	WebhookHandler     *handler.WebhookHandler
	ExportHandler      *handler.ExportHandler
	UploadHandler      *handler.UploadHandler
	KeysHandler        *handler.KeysHandler
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
	app.Use(middleware.SecurityHeaders())
	// Electron production builds send Origin: file:// — include it alongside
	// the configured origin so desktop clients can reach the API.
	allowedOrigins := []string{cfg.CORSOrigin}
	if cfg.CORSOrigin != "file://" {
		allowedOrigins = append(allowedOrigins, "file://")
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins: allowedOrigins,
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
	}))

	// Global rate limit: 120 req/min per IP on /api
	apiRateLimit := middleware.RateLimit(middleware.RateLimitConfig{
		Max:    120,
		Window: time.Minute,
	})

	// Stricter rate limits for specific endpoints
	authRateLimit := middleware.RateLimit(middleware.RateLimitConfig{
		Max:    30,
		Window: time.Minute,
	})
	messageSendRateLimit := middleware.RateLimit(middleware.RateLimitConfig{
		Max:    10,
		Window: 10 * time.Second,
		KeyFunc: middleware.UserChannelKeyFunc,
	})
	fileUploadRateLimit := middleware.RateLimit(middleware.RateLimitConfig{
		Max:    5,
		Window: time.Minute,
		KeyFunc: middleware.UserKeyFunc,
	})
	webhookExecRateLimit := middleware.RateLimit(middleware.RateLimitConfig{
		Max:    10,
		Window: time.Second,
	})
	webhookCrudRateLimit := middleware.RateLimit(middleware.RateLimitConfig{
		Max:     10,
		Window:  time.Minute,
		KeyFunc: middleware.UserKeyFunc,
	})
	uploadInitRateLimit := middleware.RateLimit(middleware.RateLimitConfig{
		Max:    10,
		Window: time.Minute,
		KeyFunc: middleware.UserKeyFunc,
	})
	wsConnRateLimit := middleware.RateLimit(middleware.RateLimitConfig{
		Max:    20,
		Window: time.Minute,
	})

	// Health check
	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Ory Hydra provider endpoints (no auth middleware)
	if cfg.OryHandler != nil {
		oryAuth := app.Group("/auth", authRateLimit)
		oryAuth.Get("/login", cfg.OryHandler.GetLogin)
		oryAuth.Get("/registration", cfg.OryHandler.GetRegistration)
		oryAuth.Get("/consent", cfg.OryHandler.GetConsent)
		oryAuth.Get("/logout", cfg.OryHandler.GetLogout)
		oryAuth.Get("/error", cfg.OryHandler.GetError)
	}

	api := app.Group("/api", apiRateLimit)

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

	// Webhook execute (public — no auth, token in URL)
	if cfg.WebhookHandler != nil {
		app.Post("/api/webhooks/:webhookId/:token", webhookExecRateLimit, cfg.WebhookHandler.ExecuteWebhook)
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
		protected.Post("/me/avatar", fileUploadRateLimit, cfg.UserHandler.UploadAvatar)
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
		// Username invitations
		protected.Post("/servers/:id/invites/username", cfg.InviteHandler.InviteByUsername)
		protected.Get("/servers/:id/invitations/sent", cfg.InviteHandler.GetSentInvitations)
		protected.Get("/invitations/received", cfg.InviteHandler.GetReceivedInvitations)
		protected.Post("/invitations/:id/accept", cfg.InviteHandler.AcceptInvitation)
		protected.Post("/invitations/:id/decline", cfg.InviteHandler.DeclineInvitation)
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
	protected.Post("/channels/:channelId/messages", messageSendRateLimit, cfg.MessageHandler.SendMessage)
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
	protected.Post("/dm/conversations/:id/messages", messageSendRateLimit, cfg.DMHandler.SendDM)
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
		protected.Delete("/threads/:threadId/messages/:messageId", cfg.ThreadHandler.DeleteMessage)
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

	// Forum channels
	if cfg.ForumHandler != nil {
		// Tags
		protected.Get("/channels/:channelId/forum/tags", cfg.ForumHandler.GetTags)
		protected.Post("/channels/:channelId/forum/tags", cfg.ForumHandler.CreateTag)
		protected.Patch("/channels/:channelId/forum/tags/:tagId", cfg.ForumHandler.UpdateTag)
		protected.Delete("/channels/:channelId/forum/tags/:tagId", cfg.ForumHandler.DeleteTag)
		// Posts
		protected.Get("/channels/:channelId/forum/posts", cfg.ForumHandler.GetPosts)
		protected.Post("/channels/:channelId/forum/posts", cfg.ForumHandler.CreatePost)
		protected.Get("/forum/posts/:postId", cfg.ForumHandler.GetPost)
		protected.Delete("/forum/posts/:postId", cfg.ForumHandler.DeletePost)
		protected.Put("/forum/posts/:postId/tags", cfg.ForumHandler.UpdatePostTags)
		protected.Put("/forum/posts/:postId/pin", cfg.ForumHandler.PinPost)
		protected.Delete("/forum/posts/:postId/pin", cfg.ForumHandler.UnpinPost)
		// Post messages
		protected.Get("/forum/posts/:postId/messages", cfg.ForumHandler.GetPostMessages)
		protected.Post("/forum/posts/:postId/messages", cfg.ForumHandler.CreatePostMessage)
		protected.Delete("/forum/posts/:postId/messages/:messageId", cfg.ForumHandler.DeletePostMessage)
	}

	// Onboarding
	if cfg.OnboardingHandler != nil {
		protected.Get("/servers/:id/welcome", cfg.OnboardingHandler.GetWelcome)
		protected.Put("/servers/:id/welcome", cfg.OnboardingHandler.UpdateWelcome)
		protected.Get("/servers/:id/onboarding", cfg.OnboardingHandler.GetOnboarding)
		protected.Put("/servers/:id/onboarding", cfg.OnboardingHandler.UpdateOnboarding)
		protected.Post("/servers/:id/onboarding/complete", cfg.OnboardingHandler.CompleteOnboarding)
		protected.Get("/servers/:id/onboarding/status", cfg.OnboardingHandler.GetOnboardingStatus)
	}

	// Channel follows (announcement channels)
	if cfg.ChannelFollowHandler != nil {
		protected.Post("/channels/:channelId/followers", cfg.ChannelFollowHandler.FollowChannel)
		protected.Delete("/channels/:channelId/followers/:followId", cfg.ChannelFollowHandler.UnfollowChannel)
		protected.Get("/channels/:channelId/followers", cfg.ChannelFollowHandler.GetFollowers)
	}

	// AutoMod
	if cfg.AutoModHandler != nil {
		protected.Get("/servers/:id/automod/rules", cfg.AutoModHandler.ListRules)
		protected.Post("/servers/:id/automod/rules", cfg.AutoModHandler.CreateRule)
		protected.Patch("/servers/:id/automod/rules/:ruleId", cfg.AutoModHandler.UpdateRule)
		protected.Delete("/servers/:id/automod/rules/:ruleId", cfg.AutoModHandler.DeleteRule)
	}

	// Stage channels
	if cfg.StageHandler != nil {
		protected.Post("/channels/:channelId/stage", cfg.StageHandler.StartStage)
		protected.Delete("/channels/:channelId/stage", cfg.StageHandler.EndStage)
		protected.Get("/channels/:channelId/stage", cfg.StageHandler.GetStageInfo)
		protected.Post("/channels/:channelId/stage/speakers", cfg.StageHandler.AddSpeaker)
		protected.Delete("/channels/:channelId/stage/speakers/:userId", cfg.StageHandler.RemoveSpeaker)
		protected.Post("/channels/:channelId/stage/hand-raise", cfg.StageHandler.RaiseHand)
		protected.Delete("/channels/:channelId/stage/hand-raise", cfg.StageHandler.LowerHand)
		protected.Post("/channels/:channelId/stage/invite/:userId", cfg.StageHandler.InviteToSpeak)
	}

	// Soundboard
	if cfg.SoundboardHandler != nil {
		protected.Get("/servers/:id/soundboard", cfg.SoundboardHandler.GetSounds)
		protected.Post("/servers/:id/soundboard", cfg.SoundboardHandler.CreateSound)
		protected.Delete("/servers/:id/soundboard/:soundId", cfg.SoundboardHandler.DeleteSound)
	}

	// Bots
	if cfg.BotHandler != nil {
		protected.Post("/bots", cfg.BotHandler.CreateBot)
		protected.Get("/bots", cfg.BotHandler.ListBots)
		protected.Delete("/bots/:botId", cfg.BotHandler.DeleteBot)
		protected.Post("/bots/:botId/regenerate-token", cfg.BotHandler.RegenerateToken)
	}

	// Webhooks (CRUD — protected)
	if cfg.WebhookHandler != nil {
		protected.Get("/channels/:channelId/webhooks", cfg.WebhookHandler.ListWebhooks)
		protected.Post("/channels/:channelId/webhooks", webhookCrudRateLimit, cfg.WebhookHandler.CreateWebhook)
		protected.Delete("/webhooks/:webhookId", webhookCrudRateLimit, cfg.WebhookHandler.DeleteWebhook)
	}

	// Exports
	if cfg.ExportHandler != nil {
		protected.Post("/channels/:channelId/export", cfg.ExportHandler.ExportChannelMessages)
		protected.Post("/me/data-export", cfg.ExportHandler.ExportAccountData)
	}

	// E2EE Identity Keys
	if cfg.KeysHandler != nil {
		protected.Post("/keys/identity", cfg.KeysHandler.RegisterIdentityKey)
		protected.Get("/keys/identity", cfg.KeysHandler.GetMyIdentityKeys)
		protected.Get("/keys/identity/:userId", cfg.KeysHandler.GetUserIdentityKeys)
		protected.Delete("/keys/identity/devices/:deviceId", cfg.KeysHandler.RemoveDeviceKey)
		protected.Put("/keys/envelope", cfg.KeysHandler.StoreKeyEnvelope)
		protected.Get("/keys/envelope", cfg.KeysHandler.GetKeyEnvelope)
		protected.Delete("/keys/envelope", cfg.KeysHandler.DeleteKeyEnvelope)
		protected.Post("/keys/group/:conversationId", cfg.KeysHandler.StoreGroupKey)
		protected.Get("/keys/group/:conversationId", cfg.KeysHandler.GetGroupKeys)
	}

	// Large file uploads
	if cfg.UploadHandler != nil {
		protected.Post("/uploads/initiate", uploadInitRateLimit, cfg.UploadHandler.InitiateUpload)
		protected.Post("/uploads/:pendingId/part-complete", cfg.UploadHandler.ReportPartComplete)
		protected.Post("/uploads/:pendingId/complete", cfg.UploadHandler.CompleteUpload)
		protected.Delete("/uploads/:pendingId", cfg.UploadHandler.AbortUpload)
	}

	// Configure allowed origins for WebSocket upgrade
	ws.AllowedOrigins = strings.Split(cfg.CORSOrigin, ",")
	for i, o := range ws.AllowedOrigins {
		ws.AllowedOrigins[i] = strings.TrimSpace(o)
	}

	// WebSocket
	app.Get("/ws", wsConnRateLimit, ws.Handler(cfg.Hub, cfg.JWKSManager, cfg.CoMemberIDsFn, cfg.ServerMemberIDsFn))
}
