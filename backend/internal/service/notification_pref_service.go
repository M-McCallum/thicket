package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrInvalidSetting   = errors.New("invalid notification setting")
	ErrInvalidScopeType = errors.New("invalid scope type")
)

type NotificationPrefService struct {
	queries *models.Queries
}

func NewNotificationPrefService(q *models.Queries) *NotificationPrefService {
	return &NotificationPrefService{queries: q}
}

func (s *NotificationPrefService) SetPref(ctx context.Context, userID uuid.UUID, scopeType string, scopeID uuid.UUID, setting string) error {
	if setting != "all" && setting != "mentions" && setting != "none" {
		return ErrInvalidSetting
	}
	if scopeType != "server" && scopeType != "channel" && scopeType != "dm" {
		return ErrInvalidScopeType
	}
	// If setting is "all" (default), just delete the override
	if setting == "all" {
		return s.queries.DeleteNotificationPref(ctx, userID, scopeType, scopeID)
	}
	return s.queries.UpsertNotificationPref(ctx, userID, scopeType, scopeID, setting)
}

func (s *NotificationPrefService) GetPrefs(ctx context.Context, userID uuid.UUID) ([]models.NotificationPref, error) {
	return s.queries.GetNotificationPrefs(ctx, userID)
}

// ShouldNotify checks if a user should be notified for a message
func (s *NotificationPrefService) ShouldNotify(ctx context.Context, userID uuid.UUID, channelID, serverID uuid.UUID, isMention bool) bool {
	prefs, err := s.queries.GetNotificationPrefs(ctx, userID)
	if err != nil {
		return true // default to notify
	}

	// Check channel-level pref first (most specific)
	for _, p := range prefs {
		if p.ScopeType == "channel" && p.ScopeID == channelID {
			return p.Setting == "all" || (p.Setting == "mentions" && isMention)
		}
	}

	// Check server-level pref
	for _, p := range prefs {
		if p.ScopeType == "server" && p.ScopeID == serverID {
			return p.Setting == "all" || (p.Setting == "mentions" && isMention)
		}
	}

	// Default: notify for all
	return true
}
