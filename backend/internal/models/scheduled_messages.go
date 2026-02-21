package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type ScheduledMessage struct {
	ID               uuid.UUID  `json:"id"`
	ChannelID        *uuid.UUID `json:"channel_id"`
	DMConversationID *uuid.UUID `json:"dm_conversation_id"`
	AuthorID         uuid.UUID  `json:"author_id"`
	Content          string     `json:"content"`
	Type             string     `json:"type"`
	ScheduledAt      time.Time  `json:"scheduled_at"`
	Sent             bool       `json:"sent"`
	CreatedAt        time.Time  `json:"created_at"`
}

type CreateScheduledMessageParams struct {
	ChannelID        *uuid.UUID
	DMConversationID *uuid.UUID
	AuthorID         uuid.UUID
	Content          string
	Type             string
	ScheduledAt      time.Time
}

func (q *Queries) CreateScheduledMessage(ctx context.Context, arg CreateScheduledMessageParams) (ScheduledMessage, error) {
	msgType := arg.Type
	if msgType == "" {
		msgType = "text"
	}
	var m ScheduledMessage
	err := q.db.QueryRow(ctx,
		`INSERT INTO scheduled_messages (channel_id, dm_conversation_id, author_id, content, type, scheduled_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, channel_id, dm_conversation_id, author_id, content, type, scheduled_at, sent, created_at`,
		arg.ChannelID, arg.DMConversationID, arg.AuthorID, arg.Content, msgType, arg.ScheduledAt,
	).Scan(&m.ID, &m.ChannelID, &m.DMConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ScheduledAt, &m.Sent, &m.CreatedAt)
	return m, err
}

func (q *Queries) GetScheduledMessagesByUser(ctx context.Context, authorID uuid.UUID) ([]ScheduledMessage, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, channel_id, dm_conversation_id, author_id, content, type, scheduled_at, sent, created_at
		FROM scheduled_messages
		WHERE author_id = $1 AND sent = FALSE
		ORDER BY scheduled_at ASC`, authorID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ScheduledMessage
	for rows.Next() {
		var m ScheduledMessage
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.DMConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ScheduledAt, &m.Sent, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []ScheduledMessage{}
	}
	return messages, rows.Err()
}

func (q *Queries) GetScheduledMessageByID(ctx context.Context, id uuid.UUID) (ScheduledMessage, error) {
	var m ScheduledMessage
	err := q.db.QueryRow(ctx,
		`SELECT id, channel_id, dm_conversation_id, author_id, content, type, scheduled_at, sent, created_at
		FROM scheduled_messages WHERE id = $1`, id,
	).Scan(&m.ID, &m.ChannelID, &m.DMConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ScheduledAt, &m.Sent, &m.CreatedAt)
	return m, err
}

func (q *Queries) UpdateScheduledMessage(ctx context.Context, id uuid.UUID, content string, scheduledAt time.Time) (ScheduledMessage, error) {
	var m ScheduledMessage
	err := q.db.QueryRow(ctx,
		`UPDATE scheduled_messages SET content = $2, scheduled_at = $3
		WHERE id = $1 AND sent = FALSE
		RETURNING id, channel_id, dm_conversation_id, author_id, content, type, scheduled_at, sent, created_at`,
		id, content, scheduledAt,
	).Scan(&m.ID, &m.ChannelID, &m.DMConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ScheduledAt, &m.Sent, &m.CreatedAt)
	return m, err
}

func (q *Queries) DeleteScheduledMessage(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM scheduled_messages WHERE id = $1`, id)
	return err
}

func (q *Queries) GetDueScheduledMessages(ctx context.Context) ([]ScheduledMessage, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, channel_id, dm_conversation_id, author_id, content, type, scheduled_at, sent, created_at
		FROM scheduled_messages
		WHERE scheduled_at <= NOW() AND sent = FALSE
		ORDER BY scheduled_at ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ScheduledMessage
	for rows.Next() {
		var m ScheduledMessage
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.DMConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ScheduledAt, &m.Sent, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []ScheduledMessage{}
	}
	return messages, rows.Err()
}

func (q *Queries) MarkScheduledMessageSent(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE scheduled_messages SET sent = TRUE WHERE id = $1`, id)
	return err
}
