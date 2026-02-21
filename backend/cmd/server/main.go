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
	inviteService := service.NewInviteService(queries, permissionService)
	readStateService := service.NewReadStateService(queries)
	notifPrefService := service.NewNotificationPrefService(queries)
	userPrefService := service.NewUserPrefService(queries)

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
			ws.BroadcastToServerMembers(hub, coMemberIDs, presenceEvent, nil)
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
			ws.BroadcastToServerMembers(hub, coMemberIDs, presenceEvent, nil)
		}
	})

	// Wire DM participants function for WS DM call events
	ws.HandlerDMParticipantsFn = dmService.GetParticipantIDs

	go hub.Run()

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
	readStateHandler := handler.NewReadStateHandler(readStateService)
	notifPrefHandler := handler.NewNotificationPrefHandler(notifPrefService)
	userPrefHandler := handler.NewUserPrefHandler(userPrefService)

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
		InviteHandler:          inviteHandler,
		ReadStateHandler:       readStateHandler,
		NotificationPrefHandler: notifPrefHandler,
		UserPrefHandler:         userPrefHandler,
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
