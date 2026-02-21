package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type ChannelReadState struct {
	UserID     uuid.UUID `json:"user_id"`
	ChannelID  uuid.UUID `json:"channel_id"`
	LastReadAt time.Time `json:"last_read_at"`
}

type DMReadState struct {
	UserID         uuid.UUID `json:"user_id"`
	ConversationID uuid.UUID `json:"conversation_id"`
	LastReadAt     time.Time `json:"last_read_at"`
}

type MentionNotification struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	MessageID uuid.UUID `json:"message_id"`
	ChannelID uuid.UUID `json:"channel_id"`
	ServerID  uuid.UUID `json:"server_id"`
	Seen      bool      `json:"seen"`
	CreatedAt time.Time `json:"created_at"`
}

type UnreadCount struct {
	ChannelID    uuid.UUID `json:"channel_id"`
	UnreadCount  int       `json:"unread_count"`
	MentionCount int       `json:"mention_count"`
}

type DMUnreadCount struct {
	ConversationID uuid.UUID `json:"conversation_id"`
	UnreadCount    int       `json:"unread_count"`
}

func (q *Queries) UpsertChannelReadState(ctx context.Context, userID, channelID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO channel_read_state (user_id, channel_id, last_read_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_at = NOW()`,
		userID, channelID,
	)
	return err
}

func (q *Queries) UpsertDMReadState(ctx context.Context, userID, conversationID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO dm_read_state (user_id, conversation_id, last_read_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = NOW()`,
		userID, conversationID,
	)
	return err
}

func (q *Queries) GetChannelUnreadCounts(ctx context.Context, userID uuid.UUID) ([]UnreadCount, error) {
	rows, err := q.db.Query(ctx,
		`SELECT c.id AS channel_id,
		        COUNT(m.id) FILTER (WHERE m.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz)) AS unread_count,
		        COUNT(mn.id) FILTER (WHERE mn.seen = false) AS mention_count
		FROM server_members sm
		JOIN channels c ON c.server_id = sm.server_id AND c.type = 'text'
		LEFT JOIN channel_read_state rs ON rs.user_id = $1 AND rs.channel_id = c.id
		LEFT JOIN messages m ON m.channel_id = c.id AND m.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz) AND m.author_id != $1
		LEFT JOIN mention_notifications mn ON mn.channel_id = c.id AND mn.user_id = $1 AND mn.seen = false
		WHERE sm.user_id = $1
		GROUP BY c.id
		HAVING COUNT(m.id) FILTER (WHERE m.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz)) > 0`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var counts []UnreadCount
	for rows.Next() {
		var uc UnreadCount
		if err := rows.Scan(&uc.ChannelID, &uc.UnreadCount, &uc.MentionCount); err != nil {
			return nil, err
		}
		counts = append(counts, uc)
	}
	if counts == nil {
		counts = []UnreadCount{}
	}
	return counts, rows.Err()
}

func (q *Queries) GetDMUnreadCounts(ctx context.Context, userID uuid.UUID) ([]DMUnreadCount, error) {
	rows, err := q.db.Query(ctx,
		`SELECT dp.conversation_id,
		        COUNT(m.id) AS unread_count
		FROM dm_participants dp
		LEFT JOIN dm_read_state rs ON rs.user_id = $1 AND rs.conversation_id = dp.conversation_id
		LEFT JOIN dm_messages m ON m.conversation_id = dp.conversation_id
		  AND m.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz)
		  AND m.author_id != $1
		WHERE dp.user_id = $1
		GROUP BY dp.conversation_id
		HAVING COUNT(m.id) > 0`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var counts []DMUnreadCount
	for rows.Next() {
		var dc DMUnreadCount
		if err := rows.Scan(&dc.ConversationID, &dc.UnreadCount); err != nil {
			return nil, err
		}
		counts = append(counts, dc)
	}
	if counts == nil {
		counts = []DMUnreadCount{}
	}
	return counts, rows.Err()
}

func (q *Queries) CreateMentionNotification(ctx context.Context, userID, messageID, channelID, serverID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO mention_notifications (user_id, message_id, channel_id, server_id)
		VALUES ($1, $2, $3, $4)`,
		userID, messageID, channelID, serverID,
	)
	return err
}

func (q *Queries) MarkMentionsSeen(ctx context.Context, userID, channelID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`UPDATE mention_notifications SET seen = true WHERE user_id = $1 AND channel_id = $2 AND seen = false`,
		userID, channelID,
	)
	return err
}
