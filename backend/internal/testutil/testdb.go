package testutil

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/M-McCallum/thicket/internal/models"
)

type TestDB struct {
	Pool      *pgxpool.Pool
	Queries   *models.Queries
	Container testcontainers.Container
}

func SetupTestDB(ctx context.Context) (*TestDB, error) {
	pgContainer, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("thicket_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("start postgres container: %w", err)
	}

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return nil, fmt.Errorf("get connection string: %w", err)
	}

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		return nil, fmt.Errorf("connect to test db: %w", err)
	}

	if err := runMigrations(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	return &TestDB{
		Pool:      pool,
		Queries:   models.New(pool),
		Container: pgContainer,
	}, nil
}

func (tdb *TestDB) Cleanup(ctx context.Context) {
	if tdb.Pool != nil {
		tdb.Pool.Close()
	}
	if tdb.Container != nil {
		_ = tdb.Container.Terminate(ctx)
	}
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	migrationsDir := findMigrationsDir()

	migrations := []string{
		"000001_init.up.sql",
		"000002_add_kratos_id.up.sql",
		"000003_remove_sessions.up.sql",
		"000004_profile_fields.up.sql",
		"000005_attachments.up.sql",
		"000006_custom_emojis.up.sql",
		"000007_stickers.up.sql",
		"000008_friends.up.sql",
		"000009_phase1_features.up.sql",
		"000010_roles_permissions.up.sql",
		"000011_edit_history_link_previews.up.sql",
		"000012_search.up.sql",
		"000013_unread_mentions.up.sql",
		"000014_notification_prefs.up.sql",
		"000015_invites_discovery.up.sql",
		"000016_user_preferences.up.sql",
		"000017_gifs_enabled.up.sql",
		"000018_slow_mode.up.sql",
		"000019_server_folders.up.sql",
		"000020_dm_enhancements.up.sql",
		"000021_scheduled_messages.up.sql",
		"000022_message_requests.up.sql",
		"000023_moderation.up.sql",
		"000024_threads.up.sql",
		"000026_polls.up.sql",
		"000027_voice_channel_status.up.sql",
		"000028_forum_channels.up.sql",
		"000029_welcome_onboarding.up.sql",
		"000030_announcement_channels.up.sql",
		"000031_automod.up.sql",
		"000032_stage_channels.up.sql",
		"000033_soundboard.up.sql",
		"000034_bots_webhooks.up.sql",
		"000035_add_pin_to_default_perms.up.sql",
		"000036_e2ee_identity_keys.up.sql",
		"000037_large_file_uploads.up.sql",
	}

	for _, name := range migrations {
		upFile := filepath.Join(migrationsDir, name)
		sql, err := os.ReadFile(upFile)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		_, err = pool.Exec(ctx, string(sql))
		if err != nil {
			return fmt.Errorf("execute migration %s: %w", name, err)
		}
	}

	return nil
}

func findMigrationsDir() string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "database", "migrations")
}

type TestUser struct {
	User        models.User
	AccessToken string
}

func CreateTestUser(ctx context.Context, q *models.Queries, jwks *TestJWKSServer) (*TestUser, error) {
	username := fmt.Sprintf("testuser_%s", uuid.New().String()[:8])
	email := fmt.Sprintf("%s@test.com", username)

	kratosID := uuid.New()
	user, err := q.CreateUser(ctx, models.CreateUserParams{
		Username:    username,
		Email:       email,
		KratosID:    kratosID,
		DisplayName: &username,
	})
	if err != nil {
		return nil, err
	}

	token := jwks.CreateToken(user.ID, user.Username)

	return &TestUser{
		User:        user,
		AccessToken: token,
	}, nil
}

func AddTestMember(ctx context.Context, q *models.Queries, serverID, userID uuid.UUID, role string) error {
	return q.AddServerMember(ctx, models.AddServerMemberParams{
		ServerID: serverID,
		UserID:   userID,
		Role:     role,
	})
}

func CreateTestChannel(ctx context.Context, q *models.Queries, serverID uuid.UUID, name, channelType string, position int32) (models.Channel, error) {
	return q.CreateChannel(ctx, models.CreateChannelParams{
		ServerID: serverID,
		Name:     name,
		Type:     channelType,
		Position: position,
	})
}

func CreateTestServer(ctx context.Context, q *models.Queries, ownerID uuid.UUID) (models.Server, models.Channel, error) {
	inviteCode := uuid.New().String()[:8]
	server, err := q.CreateServer(ctx, models.CreateServerParams{
		Name:       fmt.Sprintf("Test Server %s", inviteCode),
		OwnerID:    ownerID,
		InviteCode: inviteCode,
	})
	if err != nil {
		return models.Server{}, models.Channel{}, err
	}

	err = q.AddServerMember(ctx, models.AddServerMemberParams{
		ServerID: server.ID,
		UserID:   ownerID,
		Role:     "owner",
	})
	if err != nil {
		return models.Server{}, models.Channel{}, err
	}

	channel, err := q.CreateChannel(ctx, models.CreateChannelParams{
		ServerID: server.ID,
		Name:     "general",
		Type:     "text",
		Position: 0,
	})
	if err != nil {
		return models.Server{}, models.Channel{}, err
	}

	return server, channel, nil
}
