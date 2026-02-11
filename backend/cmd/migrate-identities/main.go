package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type user struct {
	ID           uuid.UUID
	Username     string
	Email        string
	PasswordHash string
	DisplayName  *string
}

type kratosIdentityRequest struct {
	SchemaID    string              `json:"schema_id"`
	Traits      kratosTraits        `json:"traits"`
	Credentials kratosCredentials   `json:"credentials"`
	State       string              `json:"state"`
}

type kratosTraits struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
}

type kratosCredentials struct {
	Password kratosPassword `json:"password"`
}

type kratosPassword struct {
	Config kratosPasswordConfig `json:"config"`
}

type kratosPasswordConfig struct {
	HashedPassword string `json:"hashed_password"`
}

type kratosIdentityResponse struct {
	ID string `json:"id"`
}

func main() {
	dbURL := flag.String("db-url", "", "PostgreSQL connection string (required)")
	kratosAdminURL := flag.String("kratos-admin-url", "http://localhost:4434", "Kratos admin API URL")
	dryRun := flag.Bool("dry-run", false, "Preview changes without making them")
	flag.Parse()

	if *dbURL == "" {
		fmt.Fprintln(os.Stderr, "error: --db-url is required")
		flag.Usage()
		os.Exit(1)
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, *dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	rows, err := pool.Query(ctx,
		`SELECT id, username, email, password_hash, display_name
		 FROM users WHERE kratos_id IS NULL`)
	if err != nil {
		log.Fatalf("Failed to query users: %v", err)
	}
	defer rows.Close()

	var users []user
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.DisplayName); err != nil {
			log.Fatalf("Failed to scan user row: %v", err)
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		log.Fatalf("Error iterating user rows: %v", err)
	}

	if len(users) == 0 {
		fmt.Println("No users to migrate (all users already have kratos_id set).")
		return
	}

	fmt.Printf("Found %d user(s) to migrate.\n", len(users))
	if *dryRun {
		fmt.Println("DRY RUN — no changes will be made.")
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	var migrated, skipped, failed int

	for _, u := range users {
		displayName := u.Username
		if u.DisplayName != nil {
			displayName = *u.DisplayName
		}

		if *dryRun {
			fmt.Printf("  [dry-run] Would migrate user %s (%s)\n", u.Username, u.ID)
			skipped++
			continue
		}

		kratosID, err := createKratosIdentity(httpClient, *kratosAdminURL, u, displayName)
		if err != nil {
			log.Printf("  [error] Failed to create Kratos identity for user %s (%s): %v", u.Username, u.ID, err)
			failed++
			continue
		}

		_, err = pool.Exec(ctx,
			`UPDATE users SET kratos_id = $1 WHERE id = $2`, kratosID, u.ID)
		if err != nil {
			log.Printf("  [error] Failed to update kratos_id for user %s (%s): %v", u.Username, u.ID, err)
			failed++
			continue
		}

		fmt.Printf("  [ok] Migrated user %s (%s) → kratos_id %s\n", u.Username, u.ID, kratosID)
		migrated++
	}

	fmt.Println()
	fmt.Println("Migration summary:")
	fmt.Printf("  Migrated: %d\n", migrated)
	fmt.Printf("  Skipped:  %d\n", skipped)
	fmt.Printf("  Failed:   %d\n", failed)
}

func createKratosIdentity(client *http.Client, adminURL string, u user, displayName string) (string, error) {
	reqBody := kratosIdentityRequest{
		SchemaID: "thicket",
		Traits: kratosTraits{
			Username:    u.Username,
			Email:       u.Email,
			DisplayName: displayName,
		},
		Credentials: kratosCredentials{
			Password: kratosPassword{
				Config: kratosPasswordConfig{
					HashedPassword: u.PasswordHash,
				},
			},
		},
		State: "active",
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, adminURL+"/admin/identities", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("kratos returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var identity kratosIdentityResponse
	if err := json.Unmarshal(respBody, &identity); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}

	return identity.ID, nil
}
