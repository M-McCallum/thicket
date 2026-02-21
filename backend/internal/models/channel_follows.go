package models

import (
	"context"

	"github.com/google/uuid"
)

type CreateChannelFollowParams struct {
	SourceChannelID uuid.UUID
	TargetChannelID uuid.UUID
	CreatedBy       uuid.UUID
}

func (q *Queries) CreateChannelFollow(ctx context.Context, arg CreateChannelFollowParams) (ChannelFollow, error) {
	var cf ChannelFollow
	err := q.db.QueryRow(ctx,
		`INSERT INTO channel_follows (source_channel_id, target_channel_id, created_by)
		VALUES ($1, $2, $3)
		RETURNING id, source_channel_id, target_channel_id, created_by, created_at`,
		arg.SourceChannelID, arg.TargetChannelID, arg.CreatedBy,
	).Scan(&cf.ID, &cf.SourceChannelID, &cf.TargetChannelID, &cf.CreatedBy, &cf.CreatedAt)
	return cf, err
}

func (q *Queries) DeleteChannelFollow(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM channel_follows WHERE id = $1`, id)
	return err
}

func (q *Queries) GetChannelFollowByID(ctx context.Context, id uuid.UUID) (ChannelFollow, error) {
	var cf ChannelFollow
	err := q.db.QueryRow(ctx,
		`SELECT id, source_channel_id, target_channel_id, created_by, created_at
		FROM channel_follows WHERE id = $1`, id,
	).Scan(&cf.ID, &cf.SourceChannelID, &cf.TargetChannelID, &cf.CreatedBy, &cf.CreatedAt)
	return cf, err
}

// GetChannelFollowers returns all follows where this channel is the source (announcement channel).
func (q *Queries) GetChannelFollowers(ctx context.Context, sourceChannelID uuid.UUID) ([]ChannelFollow, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, source_channel_id, target_channel_id, created_by, created_at
		FROM channel_follows WHERE source_channel_id = $1
		ORDER BY created_at`, sourceChannelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var follows []ChannelFollow
	for rows.Next() {
		var cf ChannelFollow
		if err := rows.Scan(&cf.ID, &cf.SourceChannelID, &cf.TargetChannelID, &cf.CreatedBy, &cf.CreatedAt); err != nil {
			return nil, err
		}
		follows = append(follows, cf)
	}
	if follows == nil {
		follows = []ChannelFollow{}
	}
	return follows, rows.Err()
}

// GetChannelFollowing returns all follows where this channel is the target (receiving cross-posts).
func (q *Queries) GetChannelFollowing(ctx context.Context, targetChannelID uuid.UUID) ([]ChannelFollow, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, source_channel_id, target_channel_id, created_by, created_at
		FROM channel_follows WHERE target_channel_id = $1
		ORDER BY created_at`, targetChannelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var follows []ChannelFollow
	for rows.Next() {
		var cf ChannelFollow
		if err := rows.Scan(&cf.ID, &cf.SourceChannelID, &cf.TargetChannelID, &cf.CreatedBy, &cf.CreatedAt); err != nil {
			return nil, err
		}
		follows = append(follows, cf)
	}
	if follows == nil {
		follows = []ChannelFollow{}
	}
	return follows, rows.Err()
}
