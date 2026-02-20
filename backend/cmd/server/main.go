package main

import (
	"fmt"
	"log"

	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/config"
	"github.com/M-McCallum/thicket/internal/database"
	"github.com/M-McCallum/thicket/internal/handler"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/ory"
	"github.com/M-McCallum/thicket/internal/router"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	pool, err := database.Connect(cfg.DB.URL())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	queries := models.New(pool)
	jwksManager := auth.NewJWKSManager(cfg.Ory.JWKSURL())

	// Ory clients
	kratosClient := ory.NewKratosClient(cfg.Ory.KratosAdminURL, cfg.Ory.KratosPublicURL)
	hydraClient := ory.NewHydraClient(cfg.Ory.HydraAdminURL)

	// Services
	serverService := service.NewServerService(queries)
	channelService := service.NewChannelService(queries)
	messageService := service.NewMessageService(queries)
	dmService := service.NewDMService(queries)
	identityService := service.NewIdentityService(queries, kratosClient)

	// WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Handlers
	serverHandler := handler.NewServerHandler(serverService, channelService)
	messageHandler := handler.NewMessageHandler(messageService, hub)
	dmHandler := handler.NewDMHandler(dmService, hub)
	oryHandler := handler.NewOryHandler(hydraClient, kratosClient, identityService, cfg.Ory.KratosPublicURL)

	// Fiber app
	app := fiber.New(fiber.Config{
		AppName: "Thicket API",
	})

	router.Setup(app, router.Config{
		ServerHandler:  serverHandler,
		MessageHandler: messageHandler,
		DMHandler:      dmHandler,
		OryHandler:     oryHandler,
		JWKSManager:    jwksManager,
		Hub:            hub,
		CORSOrigin:     cfg.API.CORSOrigin,
	})

	addr := fmt.Sprintf("%s:%s", cfg.API.Host, cfg.API.Port)
	log.Printf("Thicket API starting on %s", addr)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
