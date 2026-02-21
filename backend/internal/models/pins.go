package models

import (
	"context"

	"github.com/google/uuid"
)

func (q *Queries) PinMessage(ctx context.Context, channelID, messageID, pinnedBy uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO pinned_messages (channel_id, message_id, pinned_by) VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING`,
		channelID, messageID, pinnedBy,
	)
	return err
}

func (q *Queries) UnpinMessage(ctx context.Context, channelID, messageID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM pinned_messages WHERE channel_id = $1 AND message_id = $2`,
		channelID, messageID,
	)
	return err
}

func (q *Queries) GetPinnedMessages(ctx context.Context, channelID uuid.UUID) ([]MessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.channel_id, m.author_id, m.content, m.type, m.reply_to_id, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM pinned_messages pm
		JOIN messages m ON pm.message_id = m.id
		JOIN users u ON m.author_id = u.id
		WHERE pm.channel_id = $1
		ORDER BY pm.pinned_at DESC`, channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []MessageWithAuthor
	for rows.Next() {
		var m MessageWithAuthor
		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.Type, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
		); err != nil {
			return nil, err
		}
		m.Attachments = []Attachment{}
		m.Reactions = []ReactionCount{}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []MessageWithAuthor{}
	}
	return messages, rows.Err()
}

func (q *Queries) IsMessagePinned(ctx context.Context, channelID, messageID uuid.UUID) (bool, error) {
	var exists bool
	err := q.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM pinned_messages WHERE channel_id = $1 AND message_id = $2)`,
		channelID, messageID,
	).Scan(&exists)
	return exists, err
}

func (q *Queries) GetPinnedMessageCount(ctx context.Context, channelID uuid.UUID) (int, error) {
	var count int
	err := q.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM pinned_messages WHERE channel_id = $1`, channelID,
	).Scan(&count)
	return count, err
}
