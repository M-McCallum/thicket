package models

import (
	"context"

	"github.com/google/uuid"
)

type CreateCustomEmojiParams struct {
	ServerID  uuid.UUID
	Name      string
	ObjectKey string
	CreatorID uuid.UUID
}

func (q *Queries) CreateCustomEmoji(ctx context.Context, arg CreateCustomEmojiParams) (CustomEmoji, error) {
	var e CustomEmoji
	err := q.db.QueryRow(ctx,
		`INSERT INTO custom_emojis (server_id, name, object_key, creator_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, server_id, name, object_key, creator_id, created_at`,
		arg.ServerID, arg.Name, arg.ObjectKey, arg.CreatorID,
	).Scan(&e.ID, &e.ServerID, &e.Name, &e.ObjectKey, &e.CreatorID, &e.CreatedAt)
	return e, err
}

func (q *Queries) GetServerEmojis(ctx context.Context, serverID uuid.UUID) ([]CustomEmoji, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, name, object_key, creator_id, created_at
		FROM custom_emojis WHERE server_id = $1 ORDER BY name`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emojis []CustomEmoji
	for rows.Next() {
		var e CustomEmoji
		if err := rows.Scan(&e.ID, &e.ServerID, &e.Name, &e.ObjectKey, &e.CreatorID, &e.CreatedAt); err != nil {
			return nil, err
		}
		emojis = append(emojis, e)
	}
	if emojis == nil {
		emojis = []CustomEmoji{}
	}
	return emojis, rows.Err()
}

func (q *Queries) GetCustomEmojiByID(ctx context.Context, id uuid.UUID) (CustomEmoji, error) {
	var e CustomEmoji
	err := q.db.QueryRow(ctx,
		`SELECT id, server_id, name, object_key, creator_id, created_at
		FROM custom_emojis WHERE id = $1`, id,
	).Scan(&e.ID, &e.ServerID, &e.Name, &e.ObjectKey, &e.CreatorID, &e.CreatedAt)
	return e, err
}

func (q *Queries) DeleteCustomEmoji(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM custom_emojis WHERE id = $1`, id)
	return err
}
