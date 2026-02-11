package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/M-McCallum/thicket/internal/config"
)

const migrationsDir = "internal/database/migrations"

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

	if err := ensureMigrationsTable(ctx, pool); err != nil {
		log.Fatalf("Failed to create migrations table: %v", err)
	}

	if direction == "up" {
		if err := migrateUp(ctx, pool); err != nil {
			log.Fatalf("Migration up failed: %v", err)
		}
	} else {
		if err := migrateDown(ctx, pool); err != nil {
			log.Fatalf("Migration down failed: %v", err)
		}
	}
}

func ensureMigrationsTable(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	return err
}

func migrateUp(ctx context.Context, pool *pgxpool.Pool) error {
	files, err := filepath.Glob(filepath.Join(migrationsDir, "*.up.sql"))
	if err != nil {
		return fmt.Errorf("glob migration files: %w", err)
	}
	sort.Strings(files)

	for _, file := range files {
		version := extractVersion(file)

		var exists bool
		err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)", version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if exists {
			log.Printf("Skipping %s (already applied)", version)
			continue
		}

		sql, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("read %s: %w", file, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", version, err)
		}

		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("exec %s: %w", file, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", version, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit %s: %w", version, err)
		}

		log.Printf("Applied %s", version)
	}

	log.Println("Migrations up complete")
	return nil
}

func migrateDown(ctx context.Context, pool *pgxpool.Pool) error {
	files, err := filepath.Glob(filepath.Join(migrationsDir, "*.down.sql"))
	if err != nil {
		return fmt.Errorf("glob migration files: %w", err)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(files)))

	for _, file := range files {
		version := extractVersion(file)

		var exists bool
		err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)", version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if !exists {
			log.Printf("Skipping %s (not applied)", version)
			continue
		}

		sql, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("read %s: %w", file, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", version, err)
		}

		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("exec %s: %w", file, err)
		}

		if _, err := tx.Exec(ctx, "DELETE FROM schema_migrations WHERE version=$1", version); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("remove migration %s: %w", version, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit %s: %w", version, err)
		}

		log.Printf("Reverted %s", version)
	}

	log.Println("Migrations down complete")
	return nil
}

func extractVersion(path string) string {
	base := filepath.Base(path)
	// "000001_init.up.sql" → "000001_init"
	base = strings.TrimSuffix(base, ".up.sql")
	base = strings.TrimSuffix(base, ".down.sql")
	return base
}
