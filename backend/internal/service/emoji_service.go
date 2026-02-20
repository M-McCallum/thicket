package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/storage"
)

var (
	ErrEmojiNotFound   = errors.New("emoji not found")
	ErrEmojiNameTaken  = errors.New("emoji name already exists in this server")
	ErrInvalidEmojiName = errors.New("emoji name must be 1-32 characters")
)

type EmojiService struct {
	queries *models.Queries
	storage *storage.Client
}

func NewEmojiService(q *models.Queries, sc *storage.Client) *EmojiService {
	return &EmojiService{queries: q, storage: sc}
}

func (s *EmojiService) CreateEmoji(ctx context.Context, serverID, creatorID uuid.UUID, name, filename string, contentType string, reader io.Reader, size int64) (*models.CustomEmoji, error) {
	if len(name) < 1 || len(name) > 32 {
		return nil, ErrInvalidEmojiName
	}

	ext := filepath.Ext(filename)
	objectKey := fmt.Sprintf("emojis/%s/%s%s", serverID.String(), uuid.New().String(), ext)

	if err := s.storage.Upload(ctx, objectKey, contentType, reader, size); err != nil {
		return nil, fmt.Errorf("upload emoji: %w", err)
	}

	emoji, err := s.queries.CreateCustomEmoji(ctx, models.CreateCustomEmojiParams{
		ServerID:  serverID,
		Name:      name,
		ObjectKey: objectKey,
		CreatorID: creatorID,
	})
	if err != nil {
		return nil, err
	}

	return &emoji, nil
}

func (s *EmojiService) GetServerEmojis(ctx context.Context, serverID uuid.UUID) ([]models.CustomEmoji, error) {
	emojis, err := s.queries.GetServerEmojis(ctx, serverID)
	if err != nil {
		return nil, err
	}
	s.resolveURLs(ctx, emojis)
	return emojis, nil
}

func (s *EmojiService) DeleteEmoji(ctx context.Context, emojiID uuid.UUID) error {
	emoji, err := s.queries.GetCustomEmojiByID(ctx, emojiID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrEmojiNotFound
		}
		return err
	}
	_ = s.storage.Delete(ctx, emoji.ObjectKey)
	return s.queries.DeleteCustomEmoji(ctx, emojiID)
}

func (s *EmojiService) resolveURLs(ctx context.Context, emojis []models.CustomEmoji) {
	for i := range emojis {
		url, err := s.storage.GetPresignedURL(ctx, emojis[i].ObjectKey)
		if err == nil {
			emojis[i].URL = url
		}
	}
}
