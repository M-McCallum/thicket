package models

import (
	"context"

	"github.com/google/uuid"
)

func (q *Queries) AddReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
		ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
		messageID, userID, emoji,
	)
	return err
}

func (q *Queries) RemoveReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
		messageID, userID, emoji,
	)
	return err
}

type ReactionRow struct {
	MessageID uuid.UUID
	Emoji     string
	Count     int
	UserIDs   []uuid.UUID
}

func (q *Queries) GetReactionsForMessages(ctx context.Context, messageIDs []uuid.UUID) ([]ReactionRow, error) {
	rows, err := q.db.Query(ctx,
		`SELECT message_id, emoji, COUNT(*) as cnt, array_agg(user_id) as user_ids
		FROM message_reactions
		WHERE message_id = ANY($1)
		GROUP BY message_id, emoji
		ORDER BY MIN(created_at)`,
		messageIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reactions []ReactionRow
	for rows.Next() {
		var r ReactionRow
		if err := rows.Scan(&r.MessageID, &r.Emoji, &r.Count, &r.UserIDs); err != nil {
			return nil, err
		}
		reactions = append(reactions, r)
	}
	return reactions, rows.Err()
}
