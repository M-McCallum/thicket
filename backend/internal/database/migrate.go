package database

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MigrateUp runs all pending "up" migrations from the given filesystem.
// Migrations are executed in alphanumeric order, each within its own transaction.
// An advisory lock prevents concurrent migration runs (e.g. multiple replicas).
func MigrateUp(ctx context.Context, pool *pgxpool.Pool, migrations fs.FS) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	// Acquire an advisory lock so only one process migrates at a time.
	// The lock is session-scoped and released when the connection is returned.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire conn for advisory lock: %w", err)
	}
	defer conn.Release()

	// pg_advisory_lock with a fixed key — blocks until acquired.
	const lockID = 7_843_291 // arbitrary constant unique to migrations
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", lockID); err != nil {
		return fmt.Errorf("acquire advisory lock: %w", err)
	}
	defer conn.Exec(ctx, "SELECT pg_advisory_unlock($1)", lockID) //nolint:errcheck

	if err := ensureMigrationsTable(ctx, pool); err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}

	entries, err := fs.Glob(migrations, "*.up.sql")
	if err != nil {
		return fmt.Errorf("glob migration files: %w", err)
	}
	sort.Strings(entries)

	for _, name := range entries {
		version := extractVersion(name)

		var exists bool
		err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)", version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if exists {
			continue
		}

		sql, err := fs.ReadFile(migrations, name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", version, err)
		}

		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("exec %s: %w", name, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", version, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit %s: %w", version, err)
		}

		log.Printf("Applied migration: %s", version)
	}

	return nil
}

// MigrateDown reverts all applied migrations in reverse order.
func MigrateDown(ctx context.Context, pool *pgxpool.Pool, migrations fs.FS) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire conn for advisory lock: %w", err)
	}
	defer conn.Release()

	const lockID = 7_843_291
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", lockID); err != nil {
		return fmt.Errorf("acquire advisory lock: %w", err)
	}
	defer conn.Exec(ctx, "SELECT pg_advisory_unlock($1)", lockID) //nolint:errcheck

	if err := ensureMigrationsTable(ctx, pool); err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}

	entries, err := fs.Glob(migrations, "*.down.sql")
	if err != nil {
		return fmt.Errorf("glob migration files: %w", err)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(entries)))

	for _, name := range entries {
		version := extractVersion(name)

		var exists bool
		err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)", version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if !exists {
			continue
		}

		sql, err := fs.ReadFile(migrations, name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", version, err)
		}

		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("exec %s: %w", name, err)
		}

		if _, err := tx.Exec(ctx, "DELETE FROM schema_migrations WHERE version=$1", version); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("remove migration %s: %w", version, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit %s: %w", version, err)
		}

		log.Printf("Reverted migration: %s", version)
	}

	return nil
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

func extractVersion(name string) string {
	name = strings.TrimSuffix(name, ".up.sql")
	name = strings.TrimSuffix(name, ".down.sql")
	return name
}
