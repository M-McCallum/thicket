package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type CreateDMConversationParams struct {
	IsGroup bool
	Name    *string
}

func (q *Queries) CreateDMConversation(ctx context.Context, arg CreateDMConversationParams) (DMConversation, error) {
	var c DMConversation
	err := q.db.QueryRow(ctx,
		`INSERT INTO dm_conversations (is_group, name)
		VALUES ($1, $2)
		RETURNING id, is_group, name, created_at`,
		arg.IsGroup, arg.Name,
	).Scan(&c.ID, &c.IsGroup, &c.Name, &c.CreatedAt)
	return c, err
}

func (q *Queries) AddDMParticipant(ctx context.Context, conversationID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO dm_participants (conversation_id, user_id) VALUES ($1, $2)`,
		conversationID, userID,
	)
	return err
}

func (q *Queries) GetDMParticipant(ctx context.Context, conversationID, userID uuid.UUID) (DMParticipant, error) {
	var p DMParticipant
	err := q.db.QueryRow(ctx,
		`SELECT conversation_id, user_id, joined_at
		FROM dm_participants WHERE conversation_id = $1 AND user_id = $2`,
		conversationID, userID,
	).Scan(&p.ConversationID, &p.UserID, &p.JoinedAt)
	return p, err
}

func (q *Queries) GetUserDMConversations(ctx context.Context, userID uuid.UUID) ([]DMConversation, error) {
	rows, err := q.db.Query(ctx,
		`SELECT dc.id, dc.is_group, dc.name, dc.created_at
		FROM dm_conversations dc JOIN dm_participants dp ON dc.id = dp.conversation_id
		WHERE dp.user_id = $1 ORDER BY dc.created_at DESC`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convos []DMConversation
	for rows.Next() {
		var c DMConversation
		if err := rows.Scan(&c.ID, &c.IsGroup, &c.Name, &c.CreatedAt); err != nil {
			return nil, err
		}
		convos = append(convos, c)
	}
	if convos == nil {
		convos = []DMConversation{}
	}
	return convos, rows.Err()
}

func (q *Queries) GetDMParticipants(ctx context.Context, conversationID uuid.UUID) ([]DMParticipantUser, error) {
	rows, err := q.db.Query(ctx,
		`SELECT u.id, u.username, u.display_name, u.avatar_url, u.status
		FROM dm_participants dp JOIN users u ON dp.user_id = u.id
		WHERE dp.conversation_id = $1`, conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var participants []DMParticipantUser
	for rows.Next() {
		var p DMParticipantUser
		if err := rows.Scan(&p.ID, &p.Username, &p.DisplayName, &p.AvatarURL, &p.Status); err != nil {
			return nil, err
		}
		participants = append(participants, p)
	}
	if participants == nil {
		participants = []DMParticipantUser{}
	}
	return participants, rows.Err()
}

type CreateDMMessageParams struct {
	ConversationID uuid.UUID
	AuthorID       uuid.UUID
	Content        string
	Type           string
}

func (q *Queries) CreateDMMessage(ctx context.Context, arg CreateDMMessageParams) (DMMessage, error) {
	msgType := arg.Type
	if msgType == "" {
		msgType = "text"
	}
	var m DMMessage
	err := q.db.QueryRow(ctx,
		`INSERT INTO dm_messages (conversation_id, author_id, content, type)
		VALUES ($1, $2, $3, $4)
		RETURNING id, conversation_id, author_id, content, type, created_at, updated_at`,
		arg.ConversationID, arg.AuthorID, arg.Content, msgType,
	).Scan(&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.Type, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

type GetDMMessagesParams struct {
	ConversationID uuid.UUID
	Before         *time.Time
	Limit          int32
}

func (q *Queries) GetDMMessages(ctx context.Context, arg GetDMMessagesParams) ([]DMMessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT dm.id, dm.conversation_id, dm.author_id, dm.content, dm.type, dm.created_at, dm.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM dm_messages dm JOIN users u ON dm.author_id = u.id
		WHERE dm.conversation_id = $1 AND ($2::timestamptz IS NULL OR dm.created_at < $2)
		ORDER BY dm.created_at DESC LIMIT $3`,
		arg.ConversationID, arg.Before, arg.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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

type GetDMMessagesAfterParams struct {
	ConversationID uuid.UUID
	After          time.Time
	Limit          int32
}

func (q *Queries) GetDMMessagesAfter(ctx context.Context, arg GetDMMessagesAfterParams) ([]DMMessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT dm.id, dm.conversation_id, dm.author_id, dm.content, dm.type, dm.created_at, dm.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM dm_messages dm JOIN users u ON dm.author_id = u.id
		WHERE dm.conversation_id = $1 AND dm.created_at > $2
		ORDER BY dm.created_at ASC LIMIT $3`,
		arg.ConversationID, arg.After, arg.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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

func (q *Queries) GetDMConversationByID(ctx context.Context, id uuid.UUID) (DMConversation, error) {
	var c DMConversation
	err := q.db.QueryRow(ctx,
		`SELECT id, is_group, name, created_at FROM dm_conversations WHERE id = $1`, id,
	).Scan(&c.ID, &c.IsGroup, &c.Name, &c.CreatedAt)
	return c, err
}

func (q *Queries) FindExistingDMConversation(ctx context.Context, userID1, userID2 uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := q.db.QueryRow(ctx,
		`SELECT dc.id FROM dm_conversations dc
		WHERE dc.is_group = FALSE
		  AND EXISTS (SELECT 1 FROM dm_participants WHERE conversation_id = dc.id AND user_id = $1)
		  AND EXISTS (SELECT 1 FROM dm_participants WHERE conversation_id = dc.id AND user_id = $2)`,
		userID1, userID2,
	).Scan(&id)
	return id, err
}
