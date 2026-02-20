package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/M-McCallum/thicket/internal/config"
	"github.com/M-McCallum/thicket/internal/database"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: migrate <up|down>\n")
		os.Exit(1)
	}

	direction := os.Args[1]
	if direction != "up" && direction != "down" {
		fmt.Fprintf(os.Stderr, "Unknown direction %q, use 'up' or 'down'\n", direction)
		os.Exit(1)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DB.URL())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	if direction == "up" {
		if err := database.MigrateUp(ctx, pool, database.Migrations); err != nil {
			log.Fatalf("Migration up failed: %v", err)
		}
	} else {
		if err := database.MigrateDown(ctx, pool, database.Migrations); err != nil {
			log.Fatalf("Migration down failed: %v", err)
		}
	}

	log.Printf("Migration %s complete", direction)
}
