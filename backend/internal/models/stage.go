package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// StageInstance represents an active stage session on a voice channel.
type StageInstance struct {
	ID        uuid.UUID `json:"id"`
	ChannelID uuid.UUID `json:"channel_id"`
	Topic     string    `json:"topic"`
	StartedBy uuid.UUID `json:"started_by"`
	StartedAt time.Time `json:"started_at"`
}

// StageSpeaker represents a user permitted to speak on stage.
type StageSpeaker struct {
	ChannelID uuid.UUID `json:"channel_id"`
	UserID    uuid.UUID `json:"user_id"`
	Invited   bool      `json:"invited"`
	AddedAt   time.Time `json:"added_at"`
}

// StageHandRaise represents a hand-raise request from an audience member.
type StageHandRaise struct {
	ChannelID uuid.UUID `json:"channel_id"`
	UserID    uuid.UUID `json:"user_id"`
	RaisedAt  time.Time `json:"raised_at"`
}

// StageInfo is the full stage state returned to the client.
type StageInfo struct {
	Instance   *StageInstance   `json:"instance"`
	Speakers   []StageSpeaker   `json:"speakers"`
	HandRaises []StageHandRaise `json:"hand_raises"`
}

// CreateStageInstance inserts a new stage instance.
func (q *Queries) CreateStageInstance(ctx context.Context, channelID, startedBy uuid.UUID, topic string) (StageInstance, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO stage_instances (channel_id, started_by, topic)
		VALUES ($1, $2, $3)
		RETURNING id, channel_id, topic, started_by, started_at`,
		channelID, startedBy, topic,
	)
	var s StageInstance
	err := row.Scan(&s.ID, &s.ChannelID, &s.Topic, &s.StartedBy, &s.StartedAt)
	return s, err
}

// GetStageInstance retrieves the active stage instance for a channel.
func (q *Queries) GetStageInstance(ctx context.Context, channelID uuid.UUID) (StageInstance, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, channel_id, topic, started_by, started_at
		FROM stage_instances WHERE channel_id = $1`, channelID,
	)
	var s StageInstance
	err := row.Scan(&s.ID, &s.ChannelID, &s.Topic, &s.StartedBy, &s.StartedAt)
	return s, err
}

// DeleteStageInstance removes the stage instance for a channel (ending the stage).
func (q *Queries) DeleteStageInstance(ctx context.Context, channelID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM stage_instances WHERE channel_id = $1`, channelID)
	return err
}

// AddStageSpeaker adds a user as a speaker.
func (q *Queries) AddStageSpeaker(ctx context.Context, channelID, userID uuid.UUID, invited bool) (StageSpeaker, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO stage_speakers (channel_id, user_id, invited)
		VALUES ($1, $2, $3)
		ON CONFLICT (channel_id, user_id) DO UPDATE SET invited = EXCLUDED.invited
		RETURNING channel_id, user_id, invited, added_at`,
		channelID, userID, invited,
	)
	var s StageSpeaker
	err := row.Scan(&s.ChannelID, &s.UserID, &s.Invited, &s.AddedAt)
	return s, err
}

// RemoveStageSpeaker removes a speaker from the stage.
func (q *Queries) RemoveStageSpeaker(ctx context.Context, channelID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM stage_speakers WHERE channel_id = $1 AND user_id = $2`, channelID, userID)
	return err
}

// GetStageSpeakers lists all speakers for a channel.
func (q *Queries) GetStageSpeakers(ctx context.Context, channelID uuid.UUID) ([]StageSpeaker, error) {
	rows, err := q.db.Query(ctx,
		`SELECT channel_id, user_id, invited, added_at
		FROM stage_speakers WHERE channel_id = $1 ORDER BY added_at`, channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var speakers []StageSpeaker
	for rows.Next() {
		var s StageSpeaker
		if err := rows.Scan(&s.ChannelID, &s.UserID, &s.Invited, &s.AddedAt); err != nil {
			return nil, err
		}
		speakers = append(speakers, s)
	}
	if speakers == nil {
		speakers = []StageSpeaker{}
	}
	return speakers, rows.Err()
}

// IsStageSpeaker checks if a user is a speaker for a channel.
func (q *Queries) IsStageSpeaker(ctx context.Context, channelID, userID uuid.UUID) (bool, error) {
	var exists bool
	err := q.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM stage_speakers WHERE channel_id = $1 AND user_id = $2)`,
		channelID, userID,
	).Scan(&exists)
	return exists, err
}

// AddStageHandRaise records a hand raise.
func (q *Queries) AddStageHandRaise(ctx context.Context, channelID, userID uuid.UUID) (StageHandRaise, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO stage_hand_raises (channel_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT (channel_id, user_id) DO NOTHING
		RETURNING channel_id, user_id, raised_at`,
		channelID, userID,
	)
	var h StageHandRaise
	err := row.Scan(&h.ChannelID, &h.UserID, &h.RaisedAt)
	return h, err
}

// RemoveStageHandRaise removes a hand raise.
func (q *Queries) RemoveStageHandRaise(ctx context.Context, channelID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM stage_hand_raises WHERE channel_id = $1 AND user_id = $2`, channelID, userID)
	return err
}

// GetStageHandRaises lists all hand raises for a channel.
func (q *Queries) GetStageHandRaises(ctx context.Context, channelID uuid.UUID) ([]StageHandRaise, error) {
	rows, err := q.db.Query(ctx,
		`SELECT channel_id, user_id, raised_at
		FROM stage_hand_raises WHERE channel_id = $1 ORDER BY raised_at`, channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var raises []StageHandRaise
	for rows.Next() {
		var h StageHandRaise
		if err := rows.Scan(&h.ChannelID, &h.UserID, &h.RaisedAt); err != nil {
			return nil, err
		}
		raises = append(raises, h)
	}
	if raises == nil {
		raises = []StageHandRaise{}
	}
	return raises, rows.Err()
}

// DeleteStageSpeakersByChannel removes all speakers for a channel (used when ending stage).
func (q *Queries) DeleteStageSpeakersByChannel(ctx context.Context, channelID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM stage_speakers WHERE channel_id = $1`, channelID)
	return err
}

// DeleteStageHandRaisesByChannel removes all hand raises for a channel.
func (q *Queries) DeleteStageHandRaisesByChannel(ctx context.Context, channelID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM stage_hand_raises WHERE channel_id = $1`, channelID)
	return err
}
