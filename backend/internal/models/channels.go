package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CreateChannelParams struct {
	ServerID         uuid.UUID
	Name             string
	Type             string
	Position         int32
	Topic            string
	CategoryID       *uuid.UUID
	SlowModeInterval int
}

func (q *Queries) CreateChannel(ctx context.Context, arg CreateChannelParams) (Channel, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO channels (server_id, name, type, position, topic, category_id, slow_mode_interval)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, server_id, name, type, position, topic, category_id, slow_mode_interval, created_at, updated_at`,
		arg.ServerID, arg.Name, arg.Type, arg.Position, arg.Topic, arg.CategoryID, arg.SlowModeInterval,
	)
	return scanChannel(row)
}

func (q *Queries) GetChannelByID(ctx context.Context, id uuid.UUID) (Channel, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, server_id, name, type, position, topic, category_id, slow_mode_interval, created_at, updated_at
		FROM channels WHERE id = $1`, id,
	)
	return scanChannel(row)
}

func (q *Queries) GetServerChannels(ctx context.Context, serverID uuid.UUID) ([]Channel, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, name, type, position, topic, category_id, slow_mode_interval, created_at, updated_at
		FROM channels WHERE server_id = $1 ORDER BY position, name`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []Channel
	for rows.Next() {
		var ch Channel
		if err := rows.Scan(&ch.ID, &ch.ServerID, &ch.Name, &ch.Type, &ch.Position, &ch.Topic, &ch.CategoryID, &ch.SlowModeInterval, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}
	if channels == nil {
		channels = []Channel{}
	}
	return channels, rows.Err()
}

type UpdateChannelParams struct {
	ID               uuid.UUID
	Name             *string
	Position         *int32
	Topic            *string
	CategoryID       *uuid.UUID
	SlowModeInterval *int
}

func (q *Queries) UpdateChannel(ctx context.Context, arg UpdateChannelParams) (Channel, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE channels SET
			name = COALESCE($2, name),
			position = COALESCE($3, position),
			topic = COALESCE($4, topic),
			category_id = COALESCE($5, category_id),
			slow_mode_interval = COALESCE($6, slow_mode_interval),
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, server_id, name, type, position, topic, category_id, slow_mode_interval, created_at, updated_at`,
		arg.ID, arg.Name, arg.Position, arg.Topic, arg.CategoryID, arg.SlowModeInterval,
	)
	return scanChannel(row)
}

func (q *Queries) DeleteChannel(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM channels WHERE id = $1`, id)
	return err
}

func scanChannel(row pgx.Row) (Channel, error) {
	var ch Channel
	err := row.Scan(&ch.ID, &ch.ServerID, &ch.Name, &ch.Type, &ch.Position, &ch.Topic, &ch.CategoryID, &ch.SlowModeInterval, &ch.CreatedAt, &ch.UpdatedAt)
	return ch, err
}

// GetLastUserMessageTime returns the created_at of the user's most recent message in a channel.
func (q *Queries) GetLastUserMessageTime(ctx context.Context, channelID, userID uuid.UUID) (*time.Time, error) {
	var t time.Time
	err := q.db.QueryRow(ctx,
		`SELECT created_at FROM messages
		WHERE channel_id = $1 AND author_id = $2
		ORDER BY created_at DESC LIMIT 1`,
		channelID, userID,
	).Scan(&t)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}
