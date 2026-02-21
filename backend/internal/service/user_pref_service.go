package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrInvalidTheme = errors.New("invalid theme: must be solarized-dark, solarized-light, or nord")
)

type UserPrefService struct {
	queries *models.Queries
}

func NewUserPrefService(q *models.Queries) *UserPrefService {
	return &UserPrefService{queries: q}
}

func (s *UserPrefService) GetPreferences(ctx context.Context, userID uuid.UUID) (*models.UserPreferences, error) {
	p, err := s.queries.GetUserPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *UserPrefService) UpdatePreferences(ctx context.Context, userID uuid.UUID, theme *string, compactMode *bool) (*models.UserPreferences, error) {
	// Fetch current preferences to merge partial updates
	current, err := s.queries.GetUserPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}

	newTheme := current.Theme
	if theme != nil {
		newTheme = *theme
	}
	newCompactMode := current.CompactMode
	if compactMode != nil {
		newCompactMode = *compactMode
	}

	// Validate theme
	if newTheme != "solarized-dark" && newTheme != "solarized-light" && newTheme != "nord" {
		return nil, ErrInvalidTheme
	}

	p, err := s.queries.UpsertUserPreferences(ctx, userID, newTheme, newCompactMode)
	if err != nil {
		return nil, err
	}
	return &p, nil
}
