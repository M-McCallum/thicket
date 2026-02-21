package models

import (
	"context"

	"github.com/google/uuid"
)

type NotificationPref struct {
	UserID    uuid.UUID `json:"user_id"`
	ScopeType string    `json:"scope_type"` // "server", "channel", "dm"
	ScopeID   uuid.UUID `json:"scope_id"`
	Setting   string    `json:"setting"` // "all", "mentions", "none"
}

func (q *Queries) UpsertNotificationPref(ctx context.Context, userID uuid.UUID, scopeType string, scopeID uuid.UUID, setting string) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO notification_preferences (user_id, scope_type, scope_id, setting)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, scope_type, scope_id) DO UPDATE SET setting = $4`,
		userID, scopeType, scopeID, setting,
	)
	return err
}

func (q *Queries) GetNotificationPrefs(ctx context.Context, userID uuid.UUID) ([]NotificationPref, error) {
	rows, err := q.db.Query(ctx,
		`SELECT user_id, scope_type, scope_id, setting FROM notification_preferences WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prefs []NotificationPref
	for rows.Next() {
		var p NotificationPref
		if err := rows.Scan(&p.UserID, &p.ScopeType, &p.ScopeID, &p.Setting); err != nil {
			return nil, err
		}
		prefs = append(prefs, p)
	}
	if prefs == nil {
		prefs = []NotificationPref{}
	}
	return prefs, rows.Err()
}

func (q *Queries) DeleteNotificationPref(ctx context.Context, userID uuid.UUID, scopeType string, scopeID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM notification_preferences WHERE user_id = $1 AND scope_type = $2 AND scope_id = $3`,
		userID, scopeType, scopeID,
	)
	return err
}
