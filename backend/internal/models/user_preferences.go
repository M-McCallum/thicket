package models

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type UserPreferences struct {
	UserID      uuid.UUID `json:"user_id"`
	Theme       string    `json:"theme"`
	CompactMode bool      `json:"compact_mode"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (q *Queries) GetUserPreferences(ctx context.Context, userID uuid.UUID) (UserPreferences, error) {
	var p UserPreferences
	err := q.db.QueryRow(ctx,
		`SELECT user_id, theme, compact_mode, updated_at FROM user_preferences WHERE user_id = $1`,
		userID,
	).Scan(&p.UserID, &p.Theme, &p.CompactMode, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return UserPreferences{
			UserID:      userID,
			Theme:       "solarized-dark",
			CompactMode: false,
			UpdatedAt:   time.Now(),
		}, nil
	}
	return p, err
}

func (q *Queries) UpsertUserPreferences(ctx context.Context, userID uuid.UUID, theme string, compactMode bool) (UserPreferences, error) {
	var p UserPreferences
	err := q.db.QueryRow(ctx,
		`INSERT INTO user_preferences (user_id, theme, compact_mode, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (user_id) DO UPDATE SET theme = $2, compact_mode = $3, updated_at = NOW()
		RETURNING user_id, theme, compact_mode, updated_at`,
		userID, theme, compactMode,
	).Scan(&p.UserID, &p.Theme, &p.CompactMode, &p.UpdatedAt)
	return p, err
}
