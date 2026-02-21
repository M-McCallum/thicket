package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type Thread struct {
	ID                 uuid.UUID  `json:"id"`
	ChannelID          uuid.UUID  `json:"channel_id"`
	ParentMessageID    uuid.UUID  `json:"parent_message_id"`
	Name               string     `json:"name"`
	CreatorID          uuid.UUID  `json:"creator_id"`
	Archived           bool       `json:"archived"`
	Locked             bool       `json:"locked"`
	AutoArchiveMinutes int        `json:"auto_archive_minutes"`
	MessageCount       int        `json:"message_count"`
	LastMessageAt      *time.Time `json:"last_message_at"`
	CreatedAt          time.Time  `json:"created_at"`
}

type ThreadMessage struct {
	ID        uuid.UUID  `json:"id"`
	ThreadID  uuid.UUID  `json:"thread_id"`
	AuthorID  uuid.UUID  `json:"author_id"`
	Content   string     `json:"content"`
	ReplyToID *uuid.UUID `json:"reply_to_id"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"`
}

type ThreadMessageWithAuthor struct {
	ThreadMessage
	AuthorUsername    string  `json:"author_username"`
	AuthorDisplayName *string `json:"author_display_name"`
	AuthorAvatarURL  *string `json:"author_avatar_url"`
}

type ThreadSubscription struct {
	ThreadID          uuid.UUID `json:"thread_id"`
	UserID            uuid.UUID `json:"user_id"`
	NotificationLevel string   `json:"notification_level"`
}

// CreateThread inserts a new thread and returns it.
func (q *Queries) CreateThread(ctx context.Context, channelID, parentMessageID uuid.UUID, name string, creatorID uuid.UUID) (Thread, error) {
	var t Thread
	err := q.db.QueryRow(ctx,
		`INSERT INTO threads (channel_id, parent_message_id, name, creator_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, channel_id, parent_message_id, name, creator_id, archived, locked, auto_archive_minutes, message_count, last_message_at, created_at`,
		channelID, parentMessageID, name, creatorID,
	).Scan(&t.ID, &t.ChannelID, &t.ParentMessageID, &t.Name, &t.CreatorID, &t.Archived, &t.Locked, &t.AutoArchiveMinutes, &t.MessageCount, &t.LastMessageAt, &t.CreatedAt)
	return t, err
}

// GetThreadByID returns a thread by its ID.
func (q *Queries) GetThreadByID(ctx context.Context, id uuid.UUID) (Thread, error) {
	var t Thread
	err := q.db.QueryRow(ctx,
		`SELECT id, channel_id, parent_message_id, name, creator_id, archived, locked, auto_archive_minutes, message_count, last_message_at, created_at
		FROM threads WHERE id = $1`, id,
	).Scan(&t.ID, &t.ChannelID, &t.ParentMessageID, &t.Name, &t.CreatorID, &t.Archived, &t.Locked, &t.AutoArchiveMinutes, &t.MessageCount, &t.LastMessageAt, &t.CreatedAt)
	return t, err
}

// GetThreadByParentMessageID returns a thread by its parent message ID.
func (q *Queries) GetThreadByParentMessageID(ctx context.Context, parentMessageID uuid.UUID) (Thread, error) {
	var t Thread
	err := q.db.QueryRow(ctx,
		`SELECT id, channel_id, parent_message_id, name, creator_id, archived, locked, auto_archive_minutes, message_count, last_message_at, created_at
		FROM threads WHERE parent_message_id = $1`, parentMessageID,
	).Scan(&t.ID, &t.ChannelID, &t.ParentMessageID, &t.Name, &t.CreatorID, &t.Archived, &t.Locked, &t.AutoArchiveMinutes, &t.MessageCount, &t.LastMessageAt, &t.CreatedAt)
	return t, err
}

// GetThreadsByChannelID returns all threads for a channel.
func (q *Queries) GetThreadsByChannelID(ctx context.Context, channelID uuid.UUID) ([]Thread, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, channel_id, parent_message_id, name, creator_id, archived, locked, auto_archive_minutes, message_count, last_message_at, created_at
		FROM threads WHERE channel_id = $1
		ORDER BY created_at DESC`, channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []Thread
	for rows.Next() {
		var t Thread
		if err := rows.Scan(&t.ID, &t.ChannelID, &t.ParentMessageID, &t.Name, &t.CreatorID, &t.Archived, &t.Locked, &t.AutoArchiveMinutes, &t.MessageCount, &t.LastMessageAt, &t.CreatedAt); err != nil {
			return nil, err
		}
		threads = append(threads, t)
	}
	if threads == nil {
		threads = []Thread{}
	}
	return threads, rows.Err()
}

// UpdateThread updates thread fields (name, archived, locked).
func (q *Queries) UpdateThread(ctx context.Context, id uuid.UUID, name string, archived, locked bool) (Thread, error) {
	var t Thread
	err := q.db.QueryRow(ctx,
		`UPDATE threads SET name = $2, archived = $3, locked = $4
		WHERE id = $1
		RETURNING id, channel_id, parent_message_id, name, creator_id, archived, locked, auto_archive_minutes, message_count, last_message_at, created_at`,
		id, name, archived, locked,
	).Scan(&t.ID, &t.ChannelID, &t.ParentMessageID, &t.Name, &t.CreatorID, &t.Archived, &t.Locked, &t.AutoArchiveMinutes, &t.MessageCount, &t.LastMessageAt, &t.CreatedAt)
	return t, err
}

// CreateThreadMessage inserts a new message into a thread.
func (q *Queries) CreateThreadMessage(ctx context.Context, threadID, authorID uuid.UUID, content string, replyToID *uuid.UUID) (ThreadMessage, error) {
	var m ThreadMessage
	err := q.db.QueryRow(ctx,
		`INSERT INTO thread_messages (thread_id, author_id, content, reply_to_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, thread_id, author_id, content, reply_to_id, created_at, updated_at`,
		threadID, authorID, content, replyToID,
	).Scan(&m.ID, &m.ThreadID, &m.AuthorID, &m.Content, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

// IncrementThreadMessageCount increments the message count and updates last_message_at.
func (q *Queries) IncrementThreadMessageCount(ctx context.Context, threadID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`UPDATE threads SET message_count = message_count + 1, last_message_at = NOW() WHERE id = $1`,
		threadID,
	)
	return err
}

// GetThreadMessages returns paginated messages for a thread.
func (q *Queries) GetThreadMessages(ctx context.Context, threadID uuid.UUID, before *time.Time, limit int32) ([]ThreadMessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT tm.id, tm.thread_id, tm.author_id, tm.content, tm.reply_to_id, tm.created_at, tm.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM thread_messages tm
		JOIN users u ON tm.author_id = u.id
		WHERE tm.thread_id = $1 AND ($2::timestamptz IS NULL OR tm.created_at < $2)
		ORDER BY tm.created_at DESC LIMIT $3`,
		threadID, before, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ThreadMessageWithAuthor
	for rows.Next() {
		var m ThreadMessageWithAuthor
		if err := rows.Scan(
			&m.ID, &m.ThreadID, &m.AuthorID, &m.Content, &m.ReplyToID, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
		); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []ThreadMessageWithAuthor{}
	}
	return messages, rows.Err()
}

// UpsertThreadSubscription creates or updates a thread subscription.
func (q *Queries) UpsertThreadSubscription(ctx context.Context, threadID, userID uuid.UUID, notificationLevel string) (ThreadSubscription, error) {
	var s ThreadSubscription
	err := q.db.QueryRow(ctx,
		`INSERT INTO thread_subscriptions (thread_id, user_id, notification_level)
		VALUES ($1, $2, $3)
		ON CONFLICT (thread_id, user_id) DO UPDATE SET notification_level = $3
		RETURNING thread_id, user_id, notification_level`,
		threadID, userID, notificationLevel,
	).Scan(&s.ThreadID, &s.UserID, &s.NotificationLevel)
	return s, err
}

// GetThreadSubscription returns a user's subscription for a thread.
func (q *Queries) GetThreadSubscription(ctx context.Context, threadID, userID uuid.UUID) (ThreadSubscription, error) {
	var s ThreadSubscription
	err := q.db.QueryRow(ctx,
		`SELECT thread_id, user_id, notification_level
		FROM thread_subscriptions WHERE thread_id = $1 AND user_id = $2`,
		threadID, userID,
	).Scan(&s.ThreadID, &s.UserID, &s.NotificationLevel)
	return s, err
}

// GetThreadsForMessages returns threads that are attached to the given parent message IDs.
func (q *Queries) GetThreadsForMessages(ctx context.Context, messageIDs []uuid.UUID) ([]Thread, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, channel_id, parent_message_id, name, creator_id, archived, locked, auto_archive_minutes, message_count, last_message_at, created_at
		FROM threads WHERE parent_message_id = ANY($1)`,
		messageIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []Thread
	for rows.Next() {
		var t Thread
		if err := rows.Scan(&t.ID, &t.ChannelID, &t.ParentMessageID, &t.Name, &t.CreatorID, &t.Archived, &t.Locked, &t.AutoArchiveMinutes, &t.MessageCount, &t.LastMessageAt, &t.CreatedAt); err != nil {
			return nil, err
		}
		threads = append(threads, t)
	}
	if threads == nil {
		threads = []Thread{}
	}
	return threads, rows.Err()
}
