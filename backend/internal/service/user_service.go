package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrInvalidDisplayName    = errors.New("display name must be 0-64 characters")
	ErrInvalidBio            = errors.New("bio must be 0-190 characters")
	ErrInvalidPronouns       = errors.New("pronouns must be 0-50 characters")
	ErrInvalidStatus         = errors.New("status must be online, idle, dnd, or invisible")
	ErrInvalidCustomStatus   = errors.New("custom status text must be 0-128 characters")
	ErrUserNotFound          = errors.New("user not found")
)

type UserService struct {
	queries *models.Queries
}

func NewUserService(q *models.Queries) *UserService {
	return &UserService{queries: q}
}

func (s *UserService) GetProfile(ctx context.Context, userID uuid.UUID) (models.User, error) {
	return s.queries.GetUserByID(ctx, userID)
}

type UpdateProfileInput struct {
	DisplayName *string `json:"display_name"`
	Bio         *string `json:"bio"`
	Pronouns    *string `json:"pronouns"`
}

func (s *UserService) UpdateProfile(ctx context.Context, userID uuid.UUID, input UpdateProfileInput) (models.User, error) {
	if input.DisplayName != nil && len(*input.DisplayName) > 64 {
		return models.User{}, ErrInvalidDisplayName
	}
	if input.Bio != nil && len(*input.Bio) > 190 {
		return models.User{}, ErrInvalidBio
	}
	if input.Pronouns != nil && len(*input.Pronouns) > 50 {
		return models.User{}, ErrInvalidPronouns
	}

	return s.queries.UpdateFullProfile(ctx, models.UpdateFullProfileParams{
		ID:          userID,
		DisplayName: input.DisplayName,
		Bio:         input.Bio,
		Pronouns:    input.Pronouns,
	})
}

var validStatuses = map[string]string{
	"online":    "online",
	"idle":      "idle",
	"dnd":       "dnd",
	"invisible": "offline",
}

func (s *UserService) UpdateStatus(ctx context.Context, userID uuid.UUID, status string) (string, error) {
	dbStatus, ok := validStatuses[status]
	if !ok {
		return "", ErrInvalidStatus
	}
	err := s.queries.UpdateUserStatus(ctx, userID, dbStatus)
	return dbStatus, err
}

type UpdateCustomStatusInput struct {
	Text      string  `json:"text"`
	Emoji     string  `json:"emoji"`
	ExpiresIn *string `json:"expires_in"` // "30m", "1h", "4h", "today", or empty
}

func (s *UserService) UpdateCustomStatus(ctx context.Context, userID uuid.UUID, input UpdateCustomStatusInput) (models.User, error) {
	if len(input.Text) > 128 {
		return models.User{}, ErrInvalidCustomStatus
	}

	var expiresAt *time.Time
	if input.ExpiresIn != nil && *input.ExpiresIn != "" {
		now := time.Now()
		var t time.Time
		switch *input.ExpiresIn {
		case "30m":
			t = now.Add(30 * time.Minute)
		case "1h":
			t = now.Add(1 * time.Hour)
		case "4h":
			t = now.Add(4 * time.Hour)
		case "today":
			y, m, d := now.Date()
			t = time.Date(y, m, d+1, 0, 0, 0, 0, now.Location())
		default:
			// no expiry
		}
		if !t.IsZero() {
			expiresAt = &t
		}
	}

	return s.queries.UpdateCustomStatus(ctx, models.UpdateCustomStatusParams{
		ID:                    userID,
		CustomStatusText:      input.Text,
		CustomStatusEmoji:     input.Emoji,
		CustomStatusExpiresAt: expiresAt,
	})
}

func (s *UserService) SetAvatarURL(ctx context.Context, userID uuid.UUID, url string) (models.User, error) {
	return s.queries.UpdateUserProfile(ctx, models.UpdateUserProfileParams{
		ID:        userID,
		AvatarURL: &url,
	})
}

func (s *UserService) ClearAvatar(ctx context.Context, userID uuid.UUID) (models.User, error) {
	return s.queries.ClearAvatarURL(ctx, userID)
}
