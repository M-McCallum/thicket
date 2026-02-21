package main

import (
	"context"
	"fmt"
	"log"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/joho/godotenv"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/config"
	"github.com/M-McCallum/thicket/internal/database"
	"github.com/M-McCallum/thicket/internal/handler"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/ory"
	"github.com/M-McCallum/thicket/internal/router"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/storage"
	"github.com/M-McCallum/thicket/internal/ws"
)

func main() {
	// Load .env from project root (best-effort, not required)
	_ = godotenv.Load("../.env")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	pool, err := database.Connect(cfg.DB.URL())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Run pending migrations before starting the server.
	if err := database.MigrateUp(context.Background(), pool, database.Migrations); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Object storage
	storageClient, err := storage.NewClient(
		cfg.MinIO.Endpoint, cfg.MinIO.AccessKey, cfg.MinIO.SecretKey,
		cfg.MinIO.Bucket, cfg.MinIO.UseSSL,
	)
	if err != nil {
		log.Fatalf("Failed to create storage client: %v", err)
	}
	if err := storageClient.EnsureBucket(context.Background()); err != nil {
		log.Fatalf("Failed to ensure storage bucket: %v", err)
	}

	queries := models.New(pool)
	jwksManager := auth.NewJWKSManager(cfg.Ory.JWKSURL())

	// Ory clients
	kratosClient := ory.NewKratosClient(cfg.Ory.KratosAdminURL, cfg.Ory.KratosPublicURL)
	hydraClient := ory.NewHydraClient(cfg.Ory.HydraAdminURL)

	// Services
	permissionService := service.NewPermissionService(queries)
	serverService := service.NewServerService(queries, permissionService)
	channelService := service.NewChannelService(queries, permissionService)
	messageService := service.NewMessageService(queries, permissionService)
	roleService := service.NewRoleService(queries, permissionService)
	linkPreviewService := service.NewLinkPreviewService(queries)
	dmService := service.NewDMService(queries)
	identityService := service.NewIdentityService(queries, kratosClient)
	userService := service.NewUserService(queries)
	emojiService := service.NewEmojiService(queries, storageClient)
	stickerService := service.NewStickerService(queries, storageClient)
	friendService := service.NewFriendService(queries)
	stageService := service.NewStageService(queries, permissionService)
	soundboardService := service.NewSoundboardService(queries, storageClient)
	botService := service.NewBotService(queries)
	webhookService := service.NewWebhookService(queries, permissionService)
	exportService := service.NewExportService(queries)
	forumService := service.NewForumService(queries, permissionService)
	onboardingService := service.NewOnboardingService(queries, permissionService)
	moderationService := service.NewModerationService(queries, permissionService)
	threadService := service.NewThreadService(queries)
	eventService := service.NewEventService(queries)
	pollService := service.NewPollService(queries)
	inviteService := service.NewInviteService(queries, permissionService)

	// Scheduler service
	schedulerService := service.NewSchedulerService(queries, messageService, dmService)
	schedulerService.Start()
	readStateService := service.NewReadStateService(queries)
	notifPrefService := service.NewNotificationPrefService(queries)
	userPrefService := service.NewUserPrefService(queries)
	serverFolderService := service.NewServerFolderService(queries)

	// WebSocket hub
	hub := ws.NewHub()
	hub.SetOnConnect(func(userID uuid.UUID, username string) {
		ctx := context.Background()
		// Only set to "online" if the user was offline. Preserve preferred
		// statuses like "dnd" or "idle" that were explicitly chosen.
		user, err := queries.GetUserByID(ctx, userID)
		status := "online"
		if err == nil && user.Status != "offline" {
			status = user.Status
		} else {
			_ = queries.UpdateUserStatus(ctx, userID, "online")
		}
		// Broadcast presence with actual status to co-members
		coMemberIDs, err := queries.GetUserCoMemberIDs(ctx, userID)
		if err != nil {
			log.Printf("Failed to get co-member IDs for connect presence: %v", err)
			return
		}
		presenceEvent, _ := ws.NewEvent(ws.EventPresenceUpdBcast, ws.PresenceData{
			UserID:   userID.String(),
			Username: username,
			Status:   status,
		})
		if presenceEvent != nil {
			// Filter out users blocked by or blocking this user
			blockedIDs, _ := queries.GetBlockedUserIDs(ctx, userID)
			ws.BroadcastToServerMembers(hub, filterBlockedFromList(coMemberIDs, blockedIDs), presenceEvent, nil)
		}
	})
	hub.SetOnDisconnect(func(userID uuid.UUID, username string) {
		ctx := context.Background()
		_ = queries.UpdateUserStatus(ctx, userID, "offline")
		coMemberIDs, err := queries.GetUserCoMemberIDs(ctx, userID)
		if err != nil {
			log.Printf("Failed to get co-member IDs for disconnect presence: %v", err)
			return
		}
		presenceEvent, _ := ws.NewEvent(ws.EventPresenceUpdBcast, ws.PresenceData{
			UserID:   userID.String(),
			Username: username,
			Status:   "offline",
		})
		if presenceEvent != nil {
			// Filter out users blocked by or blocking this user
			blockedIDs, _ := queries.GetBlockedUserIDs(ctx, userID)
			ws.BroadcastToServerMembers(hub, filterBlockedFromList(coMemberIDs, blockedIDs), presenceEvent, nil)
		}
	})

	// Wire DM participants function for WS DM call events
	ws.HandlerDMParticipantsFn = dmService.GetParticipantIDs

	go hub.Run()

	// AutoMod service (needs hub for alerts)
	automodService := service.NewAutoModService(queries, permissionService, hub)
	messageService.SetAutoModService(automodService)

	// Handlers
	serverHandler := handler.NewServerHandler(serverService, channelService, hub)
	messageHandler := handler.NewMessageHandler(messageService, hub, storageClient)
	dmHandler := handler.NewDMHandler(dmService, hub, storageClient)
	oryHandler := handler.NewOryHandler(hydraClient, kratosClient, identityService, cfg.Ory.KratosBrowserURL)
	userHandler := handler.NewUserHandler(userService, hub, serverService.GetUserCoMemberIDs, storageClient)
	emojiHandler := handler.NewEmojiHandler(emojiService, serverService)
	stickerHandler := handler.NewStickerHandler(stickerService, serverService)
	friendHandler := handler.NewFriendHandler(friendService, hub)
	inviteHandler := handler.NewInviteHandler(inviteService, serverService, hub)
	roleHandler := handler.NewRoleHandler(roleService, serverService, hub)
	linkPreviewHandler := handler.NewLinkPreviewHandler(linkPreviewService)
	searchService := service.NewSearchService(queries)
	searchHandler := handler.NewSearchHandler(searchService)
	attachmentHandler := handler.NewAttachmentHandler(queries, storageClient)
	stageHandler := handler.NewStageHandler(stageService, serverService, hub)
	soundboardHandler := handler.NewSoundboardHandler(soundboardService, serverService)
	botHandler := handler.NewBotHandler(botService)
	webhookHandler := handler.NewWebhookHandler(webhookService, hub)
	exportHandler := handler.NewExportHandler(exportService)
	forumHandler := handler.NewForumHandler(forumService, hub)
	onboardingHandler := handler.NewOnboardingHandler(onboardingService)
	channelFollowHandler := handler.NewChannelFollowHandler(queries, permissionService)
	automodHandler := handler.NewAutoModHandler(automodService)
	moderationHandler := handler.NewModerationHandler(moderationService, serverService, hub)
	threadHandler := handler.NewThreadHandler(threadService, hub)
	eventHandler := handler.NewEventHandler(eventService, serverService, hub)
	pollHandler := handler.NewPollHandler(pollService, hub)
	readStateHandler := handler.NewReadStateHandler(readStateService)
	notifPrefHandler := handler.NewNotificationPrefHandler(notifPrefService)
	scheduleHandler := handler.NewScheduleHandler(schedulerService)
	userPrefHandler := handler.NewUserPrefHandler(userPrefService)
	serverFolderHandler := handler.NewServerFolderHandler(serverFolderService)

	// Fiber app
	app := fiber.New(fiber.Config{
		AppName:        "Thicket API",
		ReadBufferSize: 16384, // 16KB — OAuth flows carry large cookies + challenge params
	})

	// LiveKit handler
	livekitHandler := handler.NewLiveKitHandler(serverService, dmService, cfg.LiveKit.APIKey, cfg.LiveKit.APISecret)

	// GIF handler (only if GIPHY API key configured)
	var gifHandler *handler.GifHandler
	if cfg.Giphy.APIKey != "" {
		gifHandler = handler.NewGifHandler(cfg.Giphy.APIKey)
	}

	router.Setup(app, router.Config{
		ServerHandler:      serverHandler,
		MessageHandler:     messageHandler,
		DMHandler:          dmHandler,
		OryHandler:         oryHandler,
		LiveKitHandler:     livekitHandler,
		UserHandler:        userHandler,
		EmojiHandler:       emojiHandler,
		GifHandler:         gifHandler,
		StickerHandler:     stickerHandler,
		FriendHandler:      friendHandler,
		RoleHandler:        roleHandler,
		LinkPreviewHandler: linkPreviewHandler,
		SearchHandler:      searchHandler,
		AttachmentHandler:  attachmentHandler,
		ModerationHandler:  moderationHandler,
		ThreadHandler:      threadHandler,
		EventHandler:       eventHandler,
		PollHandler:        pollHandler,
		InviteHandler:          inviteHandler,
		ReadStateHandler:       readStateHandler,
		NotificationPrefHandler: notifPrefHandler,
		ScheduleHandler:         scheduleHandler,
		UserPrefHandler:         userPrefHandler,
		ServerFolderHandler:      serverFolderHandler,
		ForumHandler:             forumHandler,
		OnboardingHandler:        onboardingHandler,
		ChannelFollowHandler:     channelFollowHandler,
		AutoModHandler:           automodHandler,
		StageHandler:       stageHandler,
		SoundboardHandler:  soundboardHandler,
		BotHandler:         botHandler,
		WebhookHandler:     webhookHandler,
		ExportHandler:      exportHandler,
		JWKSManager:        jwksManager,
		Hub:                hub,
		CoMemberIDsFn:      serverService.GetUserCoMemberIDs,
		ServerMemberIDsFn:  serverService.GetServerMemberUserIDs,
		CORSOrigin:         cfg.API.CORSOrigin,
		StorageClient:      storageClient,
	})

	addr := fmt.Sprintf("%s:%s", cfg.API.Host, cfg.API.Port)
	log.Printf("Thicket API starting on %s", addr)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// filterBlockedFromList removes blocked user IDs from a list.
func filterBlockedFromList(ids []uuid.UUID, blockedIDs []uuid.UUID) []uuid.UUID {
	if len(blockedIDs) == 0 {
		return ids
	}
	blocked := make(map[uuid.UUID]bool, len(blockedIDs))
	for _, id := range blockedIDs {
		blocked[id] = true
	}
	filtered := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if !blocked[id] {
			filtered = append(filtered, id)
		}
	}
	return filtered
}
