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
	ErrStickerPackNotFound = errors.New("sticker pack not found")
	ErrStickerNotFound     = errors.New("sticker not found")
)

type StickerService struct {
	queries *models.Queries
	storage *storage.Client
}

func NewStickerService(q *models.Queries, sc *storage.Client) *StickerService {
	return &StickerService{queries: q, storage: sc}
}

func (s *StickerService) CreatePack(ctx context.Context, name string, description *string, serverID *uuid.UUID, creatorID uuid.UUID) (*models.StickerPack, error) {
	pack, err := s.queries.CreateStickerPack(ctx, models.CreateStickerPackParams{
		Name:        name,
		Description: description,
		ServerID:    serverID,
		CreatorID:   creatorID,
	})
	if err != nil {
		return nil, err
	}
	return &pack, nil
}

func (s *StickerService) GetPacks(ctx context.Context, serverID *uuid.UUID) ([]models.StickerPack, error) {
	return s.queries.GetStickerPacks(ctx, serverID)
}

func (s *StickerService) CreateSticker(ctx context.Context, packID uuid.UUID, name, filename, contentType string, reader io.Reader, size int64) (*models.Sticker, error) {
	// Verify pack exists
	_, err := s.queries.GetStickerPackByID(ctx, packID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStickerPackNotFound
		}
		return nil, err
	}

	ext := filepath.Ext(filename)
	objectKey := fmt.Sprintf("stickers/%s/%s%s", packID.String(), uuid.New().String(), ext)

	if err := s.storage.Upload(ctx, objectKey, contentType, reader, size); err != nil {
		return nil, fmt.Errorf("upload sticker: %w", err)
	}

	sticker, err := s.queries.CreateSticker(ctx, models.CreateStickerParams{
		PackID:    packID,
		Name:      name,
		ObjectKey: objectKey,
	})
	if err != nil {
		return nil, err
	}
	return &sticker, nil
}

func (s *StickerService) GetStickers(ctx context.Context, packID uuid.UUID) ([]models.Sticker, error) {
	stickers, err := s.queries.GetStickersByPackID(ctx, packID)
	if err != nil {
		return nil, err
	}
	s.resolveURLs(ctx, stickers)
	return stickers, nil
}

func (s *StickerService) GetStickerByID(ctx context.Context, id uuid.UUID) (*models.Sticker, error) {
	sticker, err := s.queries.GetStickerByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStickerNotFound
		}
		return nil, err
	}
	sticker.URL = "/api/files/" + sticker.ObjectKey
	return &sticker, nil
}

func (s *StickerService) DeleteSticker(ctx context.Context, id uuid.UUID) error {
	sticker, err := s.queries.GetStickerByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrStickerNotFound
		}
		return err
	}
	_ = s.storage.Delete(ctx, sticker.ObjectKey)
	return s.queries.DeleteSticker(ctx, id)
}

func (s *StickerService) resolveURLs(_ context.Context, stickers []models.Sticker) {
	for i := range stickers {
		stickers[i].URL = "/api/files/" + stickers[i].ObjectKey
	}
}
