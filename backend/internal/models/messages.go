package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type CreateMessageParams struct {
	ChannelID uuid.UUID
	AuthorID  uuid.UUID
	Content   string
	Type      string
}

func (q *Queries) CreateMessage(ctx context.Context, arg CreateMessageParams) (Message, error) {
	msgType := arg.Type
	if msgType == "" {
		msgType = "text"
	}
	var m Message
	err := q.db.QueryRow(ctx,
		`INSERT INTO messages (channel_id, author_id, content, type)
		VALUES ($1, $2, $3, $4)
		RETURNING id, channel_id, author_id, content, type, created_at, updated_at`,
		arg.ChannelID, arg.AuthorID, arg.Content, msgType,
	).Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

func (q *Queries) GetMessageByID(ctx context.Context, id uuid.UUID) (Message, error) {
	var m Message
	err := q.db.QueryRow(ctx,
		`SELECT id, channel_id, author_id, content, type, created_at, updated_at
		FROM messages WHERE id = $1`, id,
	).Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

type GetChannelMessagesParams struct {
	ChannelID uuid.UUID
	Before    *time.Time
	Limit     int32
}

func (q *Queries) GetChannelMessages(ctx context.Context, arg GetChannelMessagesParams) ([]MessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.channel_id, m.author_id, m.content, m.type, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM messages m JOIN users u ON m.author_id = u.id
		WHERE m.channel_id = $1 AND ($2::timestamptz IS NULL OR m.created_at < $2)
		ORDER BY m.created_at DESC LIMIT $3`,
		arg.ChannelID, arg.Before, arg.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []MessageWithAuthor
	for rows.Next() {
		var m MessageWithAuthor
		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
		); err != nil {
			return nil, err
		}
		m.Attachments = []Attachment{}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []MessageWithAuthor{}
	}
	return messages, rows.Err()
}

func (q *Queries) UpdateMessage(ctx context.Context, id uuid.UUID, content string) (Message, error) {
	var m Message
	err := q.db.QueryRow(ctx,
		`UPDATE messages SET content = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING id, channel_id, author_id, content, type, created_at, updated_at`,
		id, content,
	).Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

func (q *Queries) DeleteMessage(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM messages WHERE id = $1`, id)
	return err
}
