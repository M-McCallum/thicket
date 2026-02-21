package models

import (
	"context"

	"github.com/google/uuid"
)

// Channel-scoped search
type SearchChannelMessagesParams struct {
	Query     string
	ChannelID uuid.UUID
	Before    *string
	Limit     int32
}

func (q *Queries) SearchChannelMessages(ctx context.Context, arg SearchChannelMessagesParams) ([]MessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.channel_id, m.author_id, m.content, m.type, m.reply_to_id, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url,
		        rm.id, rm.author_id, ru.username, rm.content
		FROM messages m
		JOIN users u ON m.author_id = u.id
		LEFT JOIN messages rm ON m.reply_to_id = rm.id
		LEFT JOIN users ru ON rm.author_id = ru.id
		WHERE m.channel_id = $1
		  AND m.search_vec @@ plainto_tsquery('english', $2)
		  AND ($3::text IS NULL OR m.created_at < $3::timestamptz)
		ORDER BY m.created_at DESC LIMIT $4`,
		arg.ChannelID, arg.Query, arg.Before, arg.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessagesWithAuthor(rows)
}

// Server-scoped search
type SearchServerMessagesParams struct {
	Query    string
	ServerID uuid.UUID
	Before   *string
	Limit    int32
}

func (q *Queries) SearchServerMessages(ctx context.Context, arg SearchServerMessagesParams) ([]MessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.channel_id, m.author_id, m.content, m.type, m.reply_to_id, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url,
		        rm.id, rm.author_id, ru.username, rm.content
		FROM messages m
		JOIN users u ON m.author_id = u.id
		JOIN channels c ON m.channel_id = c.id
		LEFT JOIN messages rm ON m.reply_to_id = rm.id
		LEFT JOIN users ru ON rm.author_id = ru.id
		WHERE c.server_id = $1
		  AND m.search_vec @@ plainto_tsquery('english', $2)
		  AND ($3::text IS NULL OR m.created_at < $3::timestamptz)
		ORDER BY m.created_at DESC LIMIT $4`,
		arg.ServerID, arg.Query, arg.Before, arg.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessagesWithAuthor(rows)
}

// User-scoped search (all servers user belongs to)
type SearchUserMessagesParams struct {
	Query  string
	UserID uuid.UUID
	Before *string
	Limit  int32
}

func (q *Queries) SearchUserMessages(ctx context.Context, arg SearchUserMessagesParams) ([]MessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.channel_id, m.author_id, m.content, m.type, m.reply_to_id, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url,
		        rm.id, rm.author_id, ru.username, rm.content
		FROM messages m
		JOIN users u ON m.author_id = u.id
		JOIN channels c ON m.channel_id = c.id
		JOIN server_members sm ON c.server_id = sm.server_id AND sm.user_id = $1
		LEFT JOIN messages rm ON m.reply_to_id = rm.id
		LEFT JOIN users ru ON rm.author_id = ru.id
		WHERE m.search_vec @@ plainto_tsquery('english', $2)
		  AND ($3::text IS NULL OR m.created_at < $3::timestamptz)
		ORDER BY m.created_at DESC LIMIT $4`,
		arg.UserID, arg.Query, arg.Before, arg.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessagesWithAuthor(rows)
}

// DM conversation-scoped search
type SearchDMConversationMessagesParams struct {
	Query          string
	ConversationID uuid.UUID
	Before         *string
	Limit          int32
}

func (q *Queries) SearchDMConversationMessages(ctx context.Context, arg SearchDMConversationMessagesParams) ([]DMMessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.conversation_id, m.author_id, m.content, m.type, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM dm_messages m
		JOIN users u ON m.author_id = u.id
		WHERE m.conversation_id = $1
		  AND m.search_vec @@ plainto_tsquery('english', $2)
		  AND ($3::text IS NULL OR m.created_at < $3::timestamptz)
		ORDER BY m.created_at DESC LIMIT $4`,
		arg.ConversationID, arg.Query, arg.Before, arg.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanDMMessagesWithAuthor(rows)
}

// User-scoped DM search (all conversations user participates in)
type SearchUserDMMessagesParams struct {
	Query  string
	UserID uuid.UUID
	Before *string
	Limit  int32
}

func (q *Queries) SearchUserDMMessages(ctx context.Context, arg SearchUserDMMessagesParams) ([]DMMessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.conversation_id, m.author_id, m.content, m.type, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM dm_messages m
		JOIN users u ON m.author_id = u.id
		JOIN dm_participants dp ON m.conversation_id = dp.conversation_id AND dp.user_id = $1
		WHERE m.search_vec @@ plainto_tsquery('english', $2)
		  AND ($3::text IS NULL OR m.created_at < $3::timestamptz)
		ORDER BY m.created_at DESC LIMIT $4`,
		arg.UserID, arg.Query, arg.Before, arg.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanDMMessagesWithAuthor(rows)
}

// Shared scan helpers

func scanMessagesWithAuthor(rows interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
}) ([]MessageWithAuthor, error) {
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

func scanDMMessagesWithAuthor(rows interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
}) ([]DMMessageWithAuthor, error) {
	var messages []DMMessageWithAuthor
	for rows.Next() {
		var m DMMessageWithAuthor
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.Type, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
		); err != nil {
			return nil, err
		}
		m.Attachments = []Attachment{}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []DMMessageWithAuthor{}
	}
	return messages, rows.Err()
}
