package models

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CreateChannelParams struct {
	ServerID uuid.UUID
	Name     string
	Type     string
	Position int32
}

func (q *Queries) CreateChannel(ctx context.Context, arg CreateChannelParams) (Channel, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO channels (server_id, name, type, position)
		VALUES ($1, $2, $3, $4)
		RETURNING id, server_id, name, type, position, created_at, updated_at`,
		arg.ServerID, arg.Name, arg.Type, arg.Position,
	)
	return scanChannel(row)
}

func (q *Queries) GetChannelByID(ctx context.Context, id uuid.UUID) (Channel, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, server_id, name, type, position, created_at, updated_at
		FROM channels WHERE id = $1`, id,
	)
	return scanChannel(row)
}

func (q *Queries) GetServerChannels(ctx context.Context, serverID uuid.UUID) ([]Channel, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, name, type, position, created_at, updated_at
		FROM channels WHERE server_id = $1 ORDER BY position, name`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []Channel
	for rows.Next() {
		var ch Channel
		if err := rows.Scan(&ch.ID, &ch.ServerID, &ch.Name, &ch.Type, &ch.Position, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
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
	ID       uuid.UUID
	Name     *string
	Position *int32
}

func (q *Queries) UpdateChannel(ctx context.Context, arg UpdateChannelParams) (Channel, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE channels SET name = COALESCE($2, name), position = COALESCE($3, position), updated_at = NOW()
		WHERE id = $1
		RETURNING id, server_id, name, type, position, created_at, updated_at`,
		arg.ID, arg.Name, arg.Position,
	)
	return scanChannel(row)
}

func (q *Queries) DeleteChannel(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM channels WHERE id = $1`, id)
	return err
}

func scanChannel(row pgx.Row) (Channel, error) {
	var ch Channel
	err := row.Scan(&ch.ID, &ch.ServerID, &ch.Name, &ch.Type, &ch.Position, &ch.CreatedAt, &ch.UpdatedAt)
	return ch, err
}
