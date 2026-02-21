package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/microcosm-cc/bluemonday"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrThreadNotFound = errors.New("thread not found")
	ErrThreadLocked   = errors.New("thread is locked")
	ErrThreadArchived = errors.New("thread is archived")
)

type ThreadService struct {
	queries   *models.Queries
	sanitizer *bluemonday.Policy
}

func NewThreadService(q *models.Queries) *ThreadService {
	return &ThreadService{
		queries:   q,
		sanitizer: bluemonday.StrictPolicy(),
	}
}

func (s *ThreadService) Queries() *models.Queries {
	return s.queries
}

// CreateThread creates a new thread on a message and auto-subscribes the creator.
func (s *ThreadService) CreateThread(ctx context.Context, channelID, parentMessageID uuid.UUID, name string, creatorID uuid.UUID) (*models.Thread, error) {
	// Verify the parent message exists and belongs to this channel
	msg, err := s.queries.GetMessageByID(ctx, parentMessageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}
	if msg.ChannelID != channelID {
		return nil, ErrMessageNotInChannel
	}

	// Verify user is a member of the server
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrChannelNotFound
		}
		return nil, err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, creatorID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	// Check if thread already exists for this message
	_, err = s.queries.GetThreadByParentMessageID(ctx, parentMessageID)
	if err == nil {
		return nil, errors.New("thread already exists for this message")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	name = strings.TrimSpace(name)

	thread, err := s.queries.CreateThread(ctx, channelID, parentMessageID, name, creatorID)
	if err != nil {
		return nil, err
	}

	// Auto-subscribe the creator
	_, _ = s.queries.UpsertThreadSubscription(ctx, thread.ID, creatorID, "all")

	return &thread, nil
}

// GetThread returns a thread by ID.
func (s *ThreadService) GetThread(ctx context.Context, threadID uuid.UUID) (*models.Thread, error) {
	thread, err := s.queries.GetThreadByID(ctx, threadID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrThreadNotFound
		}
		return nil, err
	}
	return &thread, nil
}

// UpdateThread updates thread properties (name, archived, locked).
func (s *ThreadService) UpdateThread(ctx context.Context, threadID uuid.UUID, name string, archived, locked bool) (*models.Thread, error) {
	thread, err := s.queries.GetThreadByID(ctx, threadID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrThreadNotFound
		}
		return nil, err
	}

	name = strings.TrimSpace(name)
	if name == "" {
		name = thread.Name
	}

	updated, err := s.queries.UpdateThread(ctx, threadID, name, archived, locked)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// GetThreadsByChannel returns all threads for a channel.
func (s *ThreadService) GetThreadsByChannel(ctx context.Context, channelID uuid.UUID) ([]models.Thread, error) {
	return s.queries.GetThreadsByChannelID(ctx, channelID)
}

// SendThreadMessage sends a message to a thread.
func (s *ThreadService) SendThreadMessage(ctx context.Context, threadID, authorID uuid.UUID, content string, replyToID *uuid.UUID) (*models.ThreadMessageWithAuthor, error) {
	thread, err := s.queries.GetThreadByID(ctx, threadID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrThreadNotFound
		}
		return nil, err
	}

	if thread.Locked {
		return nil, ErrThreadLocked
	}
	if thread.Archived {
		return nil, ErrThreadArchived
	}

	content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	if content == "" {
		return nil, ErrEmptyMessage
	}

	// Verify user is a member of the server
	channel, err := s.queries.GetChannelByID(ctx, thread.ChannelID)
	if err != nil {
		return nil, err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, authorID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	msg, err := s.queries.CreateThreadMessage(ctx, threadID, authorID, content, replyToID)
	if err != nil {
		return nil, err
	}

	// Increment message count
	_ = s.queries.IncrementThreadMessageCount(ctx, threadID)

	// Auto-subscribe message sender
	_, _ = s.queries.UpsertThreadSubscription(ctx, threadID, authorID, "all")

	// Look up author info
	author, err := s.queries.GetUserByID(ctx, authorID)
	if err != nil {
		return nil, err
	}

	result := &models.ThreadMessageWithAuthor{
		ThreadMessage:     msg,
		AuthorUsername:    author.Username,
		AuthorDisplayName: author.DisplayName,
		AuthorAvatarURL:  author.AvatarURL,
	}

	return result, nil
}

// GetThreadMessages returns paginated messages for a thread.
func (s *ThreadService) GetThreadMessages(ctx context.Context, threadID uuid.UUID, before *time.Time, limit int32) ([]models.ThreadMessageWithAuthor, error) {
	_, err := s.queries.GetThreadByID(ctx, threadID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrThreadNotFound
		}
		return nil, err
	}

	if limit <= 0 || limit > 100 {
		limit = 50
	}

	messages, err := s.queries.GetThreadMessages(ctx, threadID, before, limit)
	if err != nil {
		return nil, err
	}

	// Resolve avatar URLs
	for i := range messages {
		if messages[i].AuthorAvatarURL != nil {
			proxyURL := "/api/files/" + *messages[i].AuthorAvatarURL
			messages[i].AuthorAvatarURL = &proxyURL
		}
	}

	return messages, nil
}

// DeleteThreadMessage deletes a thread message if the user is the author.
func (s *ThreadService) DeleteThreadMessage(ctx context.Context, threadID, messageID, userID uuid.UUID) (*models.Thread, error) {
	msg, err := s.queries.GetThreadMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}
	if msg.ThreadID != threadID {
		return nil, ErrMessageNotFound
	}
	if msg.AuthorID != userID {
		return nil, ErrNotMember
	}
	if err := s.queries.DeleteThreadMessage(ctx, messageID); err != nil {
		return nil, err
	}
	thread, err := s.queries.GetThreadByID(ctx, threadID)
	if err != nil {
		return nil, err
	}
	return &thread, nil
}

// UpdateSubscription updates a user's subscription for a thread.
func (s *ThreadService) UpdateSubscription(ctx context.Context, threadID, userID uuid.UUID, notificationLevel string) (*models.ThreadSubscription, error) {
	_, err := s.queries.GetThreadByID(ctx, threadID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrThreadNotFound
		}
		return nil, err
	}

	sub, err := s.queries.UpsertThreadSubscription(ctx, threadID, userID, notificationLevel)
	if err != nil {
		return nil, err
	}
	return &sub, nil
}

// GetSubscription returns a user's subscription for a thread.
func (s *ThreadService) GetSubscription(ctx context.Context, threadID, userID uuid.UUID) (*models.ThreadSubscription, error) {
	sub, err := s.queries.GetThreadSubscription(ctx, threadID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &sub, nil
}
