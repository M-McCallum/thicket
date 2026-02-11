package main

import (
	"fmt"
	"log"

	"github.com/gofiber/fiber/v3"

	"github.com/mitchell/neoncore/internal/config"
	"github.com/mitchell/neoncore/internal/database"
	"github.com/mitchell/neoncore/internal/handler"
	"github.com/mitchell/neoncore/internal/models"
	"github.com/mitchell/neoncore/internal/router"
	"github.com/mitchell/neoncore/internal/service"
	"github.com/mitchell/neoncore/internal/ws"

	"github.com/mitchell/neoncore/internal/auth"
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
	jwtManager := auth.NewJWTManager(cfg.JWT.Secret, cfg.JWT.AccessExpiry)

	// Services
	authService := service.NewAuthService(queries, jwtManager, cfg.JWT.RefreshExpiry)
	serverService := service.NewServerService(queries)
	channelService := service.NewChannelService(queries)
	messageService := service.NewMessageService(queries)

	// WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Handlers
	authHandler := handler.NewAuthHandler(authService)
	serverHandler := handler.NewServerHandler(serverService, channelService)
	messageHandler := handler.NewMessageHandler(messageService, hub)

	// Fiber app
	app := fiber.New(fiber.Config{
		AppName: "NeonCore API",
	})

	router.Setup(app, router.Config{
		AuthHandler:    authHandler,
		ServerHandler:  serverHandler,
		MessageHandler: messageHandler,
		JWTManager:     jwtManager,
		Hub:            hub,
		CORSOrigin:     cfg.API.CORSOrigin,
	})

	addr := fmt.Sprintf("%s:%s", cfg.API.Host, cfg.API.Port)
	log.Printf("NeonCore API starting on %s", addr)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
