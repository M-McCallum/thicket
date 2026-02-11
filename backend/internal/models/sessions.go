package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type CreateSessionParams struct {
	UserID       uuid.UUID
	RefreshToken string
	ExpiresAt    time.Time
}

func (q *Queries) CreateSession(ctx context.Context, arg CreateSessionParams) (Session, error) {
	var s Session
	err := q.db.QueryRow(ctx,
		`INSERT INTO sessions (user_id, refresh_token, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, refresh_token, expires_at, created_at`,
		arg.UserID, arg.RefreshToken, arg.ExpiresAt,
	).Scan(&s.ID, &s.UserID, &s.RefreshToken, &s.ExpiresAt, &s.CreatedAt)
	return s, err
}

func (q *Queries) GetSessionByToken(ctx context.Context, refreshToken string) (Session, error) {
	var s Session
	err := q.db.QueryRow(ctx,
		`SELECT id, user_id, refresh_token, expires_at, created_at
		FROM sessions WHERE refresh_token = $1 AND expires_at > NOW()`,
		refreshToken,
	).Scan(&s.ID, &s.UserID, &s.RefreshToken, &s.ExpiresAt, &s.CreatedAt)
	return s, err
}

func (q *Queries) DeleteSession(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	return err
}

func (q *Queries) DeleteSessionByToken(ctx context.Context, refreshToken string) error {
	_, err := q.db.Exec(ctx, `DELETE FROM sessions WHERE refresh_token = $1`, refreshToken)
	return err
}

func (q *Queries) DeleteUserSessions(ctx context.Context, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (q *Queries) CountUserSessions(ctx context.Context, userID uuid.UUID) (int64, error) {
	var count int64
	err := q.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND expires_at > NOW()`,
		userID,
	).Scan(&count)
	return count, err
}

func (q *Queries) DeleteOldestUserSession(ctx context.Context, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM sessions WHERE id = (
			SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1
		)`, userID,
	)
	return err
}
