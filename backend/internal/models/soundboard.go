package models

import (
	"context"

	"github.com/google/uuid"
)

type CreateSoundboardSoundParams struct {
	ServerID   uuid.UUID
	Name       string
	ObjectKey  string
	DurationMs int
	CreatorID  uuid.UUID
}

func (q *Queries) CreateSoundboardSound(ctx context.Context, arg CreateSoundboardSoundParams) (SoundboardSound, error) {
	var s SoundboardSound
	err := q.db.QueryRow(ctx,
		`INSERT INTO soundboard_sounds (server_id, name, object_key, duration_ms, creator_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, server_id, name, object_key, url, duration_ms, creator_id, created_at`,
		arg.ServerID, arg.Name, arg.ObjectKey, arg.DurationMs, arg.CreatorID,
	).Scan(&s.ID, &s.ServerID, &s.Name, &s.ObjectKey, &s.URL, &s.DurationMs, &s.CreatorID, &s.CreatedAt)
	return s, err
}

func (q *Queries) GetSoundboardSounds(ctx context.Context, serverID uuid.UUID) ([]SoundboardSound, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, name, object_key, url, duration_ms, creator_id, created_at
		FROM soundboard_sounds WHERE server_id = $1 ORDER BY name`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sounds []SoundboardSound
	for rows.Next() {
		var s SoundboardSound
		if err := rows.Scan(&s.ID, &s.ServerID, &s.Name, &s.ObjectKey, &s.URL, &s.DurationMs, &s.CreatorID, &s.CreatedAt); err != nil {
			return nil, err
		}
		sounds = append(sounds, s)
	}
	if sounds == nil {
		sounds = []SoundboardSound{}
	}
	return sounds, rows.Err()
}

func (q *Queries) GetSoundboardSoundByID(ctx context.Context, id uuid.UUID) (SoundboardSound, error) {
	var s SoundboardSound
	err := q.db.QueryRow(ctx,
		`SELECT id, server_id, name, object_key, url, duration_ms, creator_id, created_at
		FROM soundboard_sounds WHERE id = $1`, id,
	).Scan(&s.ID, &s.ServerID, &s.Name, &s.ObjectKey, &s.URL, &s.DurationMs, &s.CreatorID, &s.CreatedAt)
	return s, err
}

func (q *Queries) DeleteSoundboardSound(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM soundboard_sounds WHERE id = $1`, id)
	return err
}
