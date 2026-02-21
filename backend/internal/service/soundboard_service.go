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
	ErrSoundNotFound    = errors.New("sound not found")
	ErrSoundTooLarge    = errors.New("sound file must be 1MB or less")
	ErrSoundTooLong     = errors.New("sound duration must be 5 seconds or less")
	ErrInvalidSoundName = errors.New("sound name must be 1-50 characters")
	ErrInvalidSoundType = errors.New("only .mp3, .wav, and .ogg files are allowed")
)

const (
	maxSoundSize     int64 = 1 << 20 // 1 MB
	maxSoundDuration       = 5000    // 5 seconds in ms
)

type SoundboardService struct {
	queries *models.Queries
	storage *storage.Client
}

func NewSoundboardService(q *models.Queries, sc *storage.Client) *SoundboardService {
	return &SoundboardService{queries: q, storage: sc}
}

func (s *SoundboardService) CreateSound(
	ctx context.Context,
	serverID, creatorID uuid.UUID,
	name, filename, contentType string,
	reader io.Reader,
	size int64,
	durationMs int,
) (*models.SoundboardSound, error) {
	if len(name) < 1 || len(name) > 50 {
		return nil, ErrInvalidSoundName
	}

	ext := filepath.Ext(filename)
	switch ext {
	case ".mp3", ".wav", ".ogg":
		// allowed
	default:
		return nil, ErrInvalidSoundType
	}

	if size > maxSoundSize {
		return nil, ErrSoundTooLarge
	}

	if durationMs > maxSoundDuration {
		return nil, ErrSoundTooLong
	}

	objectKey := fmt.Sprintf("soundboard/%s/%s%s", serverID.String(), uuid.New().String(), ext)

	if err := s.storage.Upload(ctx, objectKey, contentType, reader, size); err != nil {
		return nil, fmt.Errorf("upload sound: %w", err)
	}

	sound, err := s.queries.CreateSoundboardSound(ctx, models.CreateSoundboardSoundParams{
		ServerID:   serverID,
		Name:       name,
		ObjectKey:  objectKey,
		DurationMs: durationMs,
		CreatorID:  creatorID,
	})
	if err != nil {
		// Best-effort cleanup
		_ = s.storage.Delete(ctx, objectKey)
		return nil, err
	}

	sound.URL = "/api/files/" + sound.ObjectKey
	return &sound, nil
}

func (s *SoundboardService) GetSounds(ctx context.Context, serverID uuid.UUID) ([]models.SoundboardSound, error) {
	sounds, err := s.queries.GetSoundboardSounds(ctx, serverID)
	if err != nil {
		return nil, err
	}
	for i := range sounds {
		sounds[i].URL = "/api/files/" + sounds[i].ObjectKey
	}
	return sounds, nil
}

func (s *SoundboardService) DeleteSound(ctx context.Context, soundID uuid.UUID) error {
	sound, err := s.queries.GetSoundboardSoundByID(ctx, soundID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrSoundNotFound
		}
		return err
	}
	_ = s.storage.Delete(ctx, sound.ObjectKey)
	return s.queries.DeleteSoundboardSound(ctx, soundID)
}

func (s *SoundboardService) GetSoundByID(ctx context.Context, soundID uuid.UUID) (*models.SoundboardSound, error) {
	sound, err := s.queries.GetSoundboardSoundByID(ctx, soundID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSoundNotFound
		}
		return nil, err
	}
	return &sound, nil
}
