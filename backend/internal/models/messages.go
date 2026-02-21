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
	ReplyToID *uuid.UUID
}

func (q *Queries) CreateMessage(ctx context.Context, arg CreateMessageParams) (Message, error) {
	msgType := arg.Type
	if msgType == "" {
		msgType = "text"
	}
	var m Message
	err := q.db.QueryRow(ctx,
		`INSERT INTO messages (channel_id, author_id, content, type, reply_to_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, channel_id, author_id, content, type, reply_to_id, created_at, updated_at`,
		arg.ChannelID, arg.AuthorID, arg.Content, msgType, arg.ReplyToID,
	).Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

func (q *Queries) GetMessageByID(ctx context.Context, id uuid.UUID) (Message, error) {
	var m Message
	err := q.db.QueryRow(ctx,
		`SELECT id, channel_id, author_id, content, type, reply_to_id, created_at, updated_at
		FROM messages WHERE id = $1`, id,
	).Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

type GetChannelMessagesParams struct {
	ChannelID uuid.UUID
	Before    *time.Time
	Limit     int32
}

func (q *Queries) GetChannelMessages(ctx context.Context, arg GetChannelMessagesParams) ([]MessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.channel_id, m.author_id, m.content, m.type, m.reply_to_id, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url,
		        rm.id, rm.author_id, ru.username, rm.content
		FROM messages m
		JOIN users u ON m.author_id = u.id
		LEFT JOIN messages rm ON m.reply_to_id = rm.id
		LEFT JOIN users ru ON rm.author_id = ru.id
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
		var replyID, replyAuthorID *uuid.UUID
		var replyUsername, replyContent *string
		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
			&replyID, &replyAuthorID, &replyUsername, &replyContent,
		); err != nil {
			return nil, err
		}
		m.Attachments = []Attachment{}
		m.Reactions = []ReactionCount{}
		if replyID != nil {
			m.ReplyTo = &ReplySnippet{
				ID:             *replyID,
				AuthorID:       *replyAuthorID,
				AuthorUsername: *replyUsername,
				Content:        *replyContent,
			}
		}
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
		RETURNING id, channel_id, author_id, content, type, reply_to_id, created_at, updated_at`,
		id, content,
	).Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

func (q *Queries) DeleteMessage(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM messages WHERE id = $1`, id)
	return err
}

// Edit history

func (q *Queries) InsertMessageEdit(ctx context.Context, messageID uuid.UUID, content string) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO message_edits (message_id, content) VALUES ($1, $2)`,
		messageID, content,
	)
	return err
}

func (q *Queries) GetMessageEdits(ctx context.Context, messageID uuid.UUID) ([]MessageEdit, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, message_id, content, edited_at
		FROM message_edits WHERE message_id = $1
		ORDER BY edited_at DESC`, messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var edits []MessageEdit
	for rows.Next() {
		var e MessageEdit
		if err := rows.Scan(&e.ID, &e.MessageID, &e.Content, &e.EditedAt); err != nil {
			return nil, err
		}
		edits = append(edits, e)
	}
	if edits == nil {
		edits = []MessageEdit{}
	}
	return edits, rows.Err()
}
