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

	"github.com/mitchell/neoncore/internal/auth"
	"github.com/mitchell/neoncore/internal/models"
)

type TestDB struct {
	Pool      *pgxpool.Pool
	Queries   *models.Queries
	Container testcontainers.Container
}

func SetupTestDB(ctx context.Context) (*TestDB, error) {
	pgContainer, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("neoncore_test"),
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

	upFile := filepath.Join(migrationsDir, "000001_init.up.sql")
	sql, err := os.ReadFile(upFile)
	if err != nil {
		return fmt.Errorf("read migration file: %w", err)
	}

	_, err = pool.Exec(ctx, string(sql))
	if err != nil {
		return fmt.Errorf("execute migration: %w", err)
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
	Password    string
}

func CreateTestUser(ctx context.Context, q *models.Queries, jwtManager *auth.JWTManager) (*TestUser, error) {
	password := "testpassword123"
	hash, err := auth.HashPassword(password)
	if err != nil {
		return nil, err
	}

	username := fmt.Sprintf("testuser_%s", uuid.New().String()[:8])
	email := fmt.Sprintf("%s@test.com", username)

	user, err := q.CreateUser(ctx, models.CreateUserParams{
		Username:     username,
		Email:        email,
		PasswordHash: hash,
		DisplayName:  &username,
	})
	if err != nil {
		return nil, err
	}

	token, err := jwtManager.CreateAccessToken(user.ID, user.Username)
	if err != nil {
		return nil, err
	}

	return &TestUser{
		User:        user,
		AccessToken: token,
		Password:    password,
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
