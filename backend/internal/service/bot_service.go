package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrBotNotFound     = errors.New("bot not found")
	ErrBotNotOwner     = errors.New("not the owner of this bot")
	ErrBotNameTaken    = errors.New("bot username is already taken")
	ErrInvalidBotName  = errors.New("bot username must be 1-32 characters")
	ErrInvalidBotToken = errors.New("invalid bot token")
)

type BotService struct {
	queries *models.Queries
}

func NewBotService(q *models.Queries) *BotService {
	return &BotService{queries: q}
}

// GenerateToken creates a cryptographically random token (32 bytes, hex-encoded).
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// HashToken bcrypt-hashes a token for storage.
func HashToken(token string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(token), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// ValidateToken checks a plaintext token against a bcrypt hash.
func ValidateToken(token, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(token)) == nil
}

// CreateBot creates a new bot user and returns the bot + plaintext token (shown once).
func (s *BotService) CreateBot(ctx context.Context, ownerID uuid.UUID, username string) (*models.BotUser, string, error) {
	if len(username) < 1 || len(username) > 32 {
		return nil, "", ErrInvalidBotName
	}

	token, err := GenerateToken()
	if err != nil {
		return nil, "", err
	}

	tokenHash, err := HashToken(token)
	if err != nil {
		return nil, "", err
	}

	bot, err := s.queries.CreateBotUser(ctx, models.CreateBotUserParams{
		OwnerID:   ownerID,
		Username:  username,
		TokenHash: tokenHash,
	})
	if err != nil {
		// Check for unique constraint violation on username
		if isDuplicateKeyError(err) {
			return nil, "", ErrBotNameTaken
		}
		return nil, "", err
	}

	return &bot, token, nil
}

// ListBots returns all bots owned by the given user.
func (s *BotService) ListBots(ctx context.Context, ownerID uuid.UUID) ([]models.BotUser, error) {
	return s.queries.GetBotUsersByOwner(ctx, ownerID)
}

// DeleteBot deletes a bot if the caller is its owner.
func (s *BotService) DeleteBot(ctx context.Context, botID, ownerID uuid.UUID) error {
	bot, err := s.queries.GetBotUserByID(ctx, botID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrBotNotFound
		}
		return err
	}
	if bot.OwnerID != ownerID {
		return ErrBotNotOwner
	}
	return s.queries.DeleteBotUser(ctx, botID)
}

// RegenerateToken generates a new token for a bot, returning the new plaintext token.
func (s *BotService) RegenerateToken(ctx context.Context, botID, ownerID uuid.UUID) (string, error) {
	bot, err := s.queries.GetBotUserByID(ctx, botID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrBotNotFound
		}
		return "", err
	}
	if bot.OwnerID != ownerID {
		return "", ErrBotNotOwner
	}

	token, err := GenerateToken()
	if err != nil {
		return "", err
	}

	tokenHash, err := HashToken(token)
	if err != nil {
		return "", err
	}

	if err := s.queries.UpdateBotTokenHash(ctx, botID, tokenHash); err != nil {
		return "", err
	}

	return token, nil
}

// ValidateBotToken checks a token against all bots and returns the matching bot.
func (s *BotService) ValidateBotToken(ctx context.Context, token string) (*models.BotUser, error) {
	bots, err := s.queries.GetAllBotUsers(ctx)
	if err != nil {
		return nil, err
	}

	for _, bot := range bots {
		if ValidateToken(token, bot.TokenHash) {
			return &bot, nil
		}
	}

	return nil, ErrInvalidBotToken
}

// isDuplicateKeyError checks if a pgx error is a unique constraint violation.
func isDuplicateKeyError(err error) bool {
	// pgconn.PgError code 23505 = unique_violation
	var pgErr interface{ Code() string }
	if errors.As(err, &pgErr) {
		return pgErr.Code() == "23505"
	}
	return false
}
