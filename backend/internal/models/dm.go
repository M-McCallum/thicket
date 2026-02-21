package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type CreateDMConversationParams struct {
	IsGroup  bool
	Name     *string
	Accepted bool
}

func (q *Queries) CreateDMConversation(ctx context.Context, arg CreateDMConversationParams) (DMConversation, error) {
	var c DMConversation
	err := q.db.QueryRow(ctx,
		`INSERT INTO dm_conversations (is_group, name, accepted)
		VALUES ($1, $2, $3)
		RETURNING id, is_group, name, accepted, encrypted, created_at`,
		arg.IsGroup, arg.Name, arg.Accepted,
	).Scan(&c.ID, &c.IsGroup, &c.Name, &c.Accepted, &c.Encrypted, &c.CreatedAt)
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
		`SELECT dc.id, dc.is_group, dc.name, dc.accepted, dc.encrypted, dc.created_at
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
		if err := rows.Scan(&c.ID, &c.IsGroup, &c.Name, &c.Accepted, &c.Encrypted, &c.CreatedAt); err != nil {
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
	ReplyToID      *uuid.UUID
}

func (q *Queries) CreateDMMessage(ctx context.Context, arg CreateDMMessageParams) (DMMessage, error) {
	msgType := arg.Type
	if msgType == "" {
		msgType = "text"
	}
	var m DMMessage
	err := q.db.QueryRow(ctx,
		`INSERT INTO dm_messages (conversation_id, author_id, content, type, reply_to_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, conversation_id, author_id, content, type, reply_to_id, created_at, updated_at`,
		arg.ConversationID, arg.AuthorID, arg.Content, msgType, arg.ReplyToID,
	).Scan(&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

type GetDMMessagesParams struct {
	ConversationID uuid.UUID
	Before         *time.Time
	Limit          int32
}

func (q *Queries) GetDMMessages(ctx context.Context, arg GetDMMessagesParams) ([]DMMessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT dm.id, dm.conversation_id, dm.author_id, dm.content, dm.type, dm.reply_to_id, dm.created_at, dm.updated_at,
		        u.username, u.display_name, u.avatar_url,
		        r.id, r.author_id, ru.username, r.content
		FROM dm_messages dm JOIN users u ON dm.author_id = u.id
		LEFT JOIN dm_messages r ON dm.reply_to_id = r.id
		LEFT JOIN users ru ON r.author_id = ru.id
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
		var replyID *uuid.UUID
		var replyAuthorID *uuid.UUID
		var replyUsername *string
		var replyContent *string
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
			&replyID, &replyAuthorID, &replyUsername, &replyContent,
		); err != nil {
			return nil, err
		}
		m.Attachments = []Attachment{}
		m.Reactions = []DMReactionCount{}
		if replyID != nil {
			m.ReplyTo = &DMReplySnippet{
				ID:             *replyID,
				AuthorID:       *replyAuthorID,
				AuthorUsername: *replyUsername,
				Content:        *replyContent,
			}
		}
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
		`SELECT dm.id, dm.conversation_id, dm.author_id, dm.content, dm.type, dm.reply_to_id, dm.created_at, dm.updated_at,
		        u.username, u.display_name, u.avatar_url,
		        r.id, r.author_id, ru.username, r.content
		FROM dm_messages dm JOIN users u ON dm.author_id = u.id
		LEFT JOIN dm_messages r ON dm.reply_to_id = r.id
		LEFT JOIN users ru ON r.author_id = ru.id
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
		var replyID *uuid.UUID
		var replyAuthorID *uuid.UUID
		var replyUsername *string
		var replyContent *string
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
			&replyID, &replyAuthorID, &replyUsername, &replyContent,
		); err != nil {
			return nil, err
		}
		m.Attachments = []Attachment{}
		m.Reactions = []DMReactionCount{}
		if replyID != nil {
			m.ReplyTo = &DMReplySnippet{
				ID:             *replyID,
				AuthorID:       *replyAuthorID,
				AuthorUsername: *replyUsername,
				Content:        *replyContent,
			}
		}
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
		`SELECT id, is_group, name, accepted, encrypted, created_at FROM dm_conversations WHERE id = $1`, id,
	).Scan(&c.ID, &c.IsGroup, &c.Name, &c.Accepted, &c.Encrypted, &c.CreatedAt)
	return c, err
}

func (q *Queries) AcceptDMConversation(ctx context.Context, conversationID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`UPDATE dm_conversations SET accepted = TRUE WHERE id = $1`,
		conversationID,
	)
	return err
}

func (q *Queries) DeleteDMConversation(ctx context.Context, conversationID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM dm_conversations WHERE id = $1`,
		conversationID,
	)
	return err
}

func (q *Queries) RemoveDMParticipant(ctx context.Context, conversationID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM dm_participants WHERE conversation_id = $1 AND user_id = $2`,
		conversationID, userID,
	)
	return err
}

func (q *Queries) GetDMParticipantCount(ctx context.Context, conversationID uuid.UUID) (int, error) {
	var count int
	err := q.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm_participants WHERE conversation_id = $1`,
		conversationID,
	).Scan(&count)
	return count, err
}

func (q *Queries) UpdateDMConversationName(ctx context.Context, conversationID uuid.UUID, name *string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE dm_conversations SET name = $2 WHERE id = $1`,
		conversationID, name,
	)
	return err
}

func (q *Queries) GetDMMessageByID(ctx context.Context, messageID uuid.UUID) (DMMessage, error) {
	var m DMMessage
	err := q.db.QueryRow(ctx,
		`SELECT id, conversation_id, author_id, content, type, reply_to_id, created_at, updated_at
		FROM dm_messages WHERE id = $1`, messageID,
	).Scan(&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

func (q *Queries) UpdateDMMessage(ctx context.Context, messageID uuid.UUID, content string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE dm_messages SET content = $2, updated_at = NOW() WHERE id = $1`,
		messageID, content,
	)
	return err
}

func (q *Queries) DeleteDMMessage(ctx context.Context, messageID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM dm_messages WHERE id = $1`, messageID,
	)
	return err
}

func (q *Queries) CreateDMMessageEdit(ctx context.Context, messageID uuid.UUID, content string) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO dm_message_edits (dm_message_id, content) VALUES ($1, $2)`,
		messageID, content,
	)
	return err
}

func (q *Queries) GetDMMessageEdits(ctx context.Context, messageID uuid.UUID) ([]DMMessageEdit, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, dm_message_id, content, edited_at FROM dm_message_edits
		WHERE dm_message_id = $1 ORDER BY edited_at DESC`, messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var edits []DMMessageEdit
	for rows.Next() {
		var e DMMessageEdit
		if err := rows.Scan(&e.ID, &e.DMMessageID, &e.Content, &e.EditedAt); err != nil {
			return nil, err
		}
		edits = append(edits, e)
	}
	if edits == nil {
		edits = []DMMessageEdit{}
	}
	return edits, rows.Err()
}

func (q *Queries) AddDMReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO dm_message_reactions (dm_message_id, user_id, emoji)
		VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		messageID, userID, emoji,
	)
	return err
}

func (q *Queries) RemoveDMReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM dm_message_reactions WHERE dm_message_id = $1 AND user_id = $2 AND emoji = $3`,
		messageID, userID, emoji,
	)
	return err
}

func (q *Queries) GetDMMessageReactions(ctx context.Context, messageIDs []uuid.UUID, requestingUserID uuid.UUID) (map[uuid.UUID][]DMReactionCount, error) {
	if len(messageIDs) == 0 {
		return map[uuid.UUID][]DMReactionCount{}, nil
	}

	rows, err := q.db.Query(ctx,
		`SELECT dm_message_id, emoji, COUNT(*) as count,
		        BOOL_OR(user_id = $2) as me
		FROM dm_message_reactions
		WHERE dm_message_id = ANY($1)
		GROUP BY dm_message_id, emoji
		ORDER BY MIN(created_at)`,
		messageIDs, requestingUserID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]DMReactionCount)
	for rows.Next() {
		var msgID uuid.UUID
		var rc DMReactionCount
		if err := rows.Scan(&msgID, &rc.Emoji, &rc.Count, &rc.Me); err != nil {
			return nil, err
		}
		result[msgID] = append(result[msgID], rc)
	}
	return result, rows.Err()
}

func (q *Queries) PinDMMessage(ctx context.Context, conversationID, messageID, pinnedBy uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO dm_pinned_messages (conversation_id, dm_message_id, pinned_by)
		VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		conversationID, messageID, pinnedBy,
	)
	return err
}

func (q *Queries) UnpinDMMessage(ctx context.Context, conversationID, messageID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM dm_pinned_messages WHERE conversation_id = $1 AND dm_message_id = $2`,
		conversationID, messageID,
	)
	return err
}

func (q *Queries) GetDMPinnedMessages(ctx context.Context, conversationID uuid.UUID) ([]DMMessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT dm.id, dm.conversation_id, dm.author_id, dm.content, dm.type, dm.reply_to_id, dm.created_at, dm.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM dm_pinned_messages p
		JOIN dm_messages dm ON p.dm_message_id = dm.id
		JOIN users u ON dm.author_id = u.id
		WHERE p.conversation_id = $1
		ORDER BY p.pinned_at DESC`, conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []DMMessageWithAuthor
	for rows.Next() {
		var m DMMessageWithAuthor
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
		); err != nil {
			return nil, err
		}
		m.Attachments = []Attachment{}
		m.Reactions = []DMReactionCount{}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []DMMessageWithAuthor{}
	}
	return messages, rows.Err()
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
