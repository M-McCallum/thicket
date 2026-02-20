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
	ErrMessageNotFound = errors.New("message not found")
	ErrNotAuthor       = errors.New("not the author of this message")
	ErrEmptyMessage    = errors.New("message content cannot be empty")
)

type MessageService struct {
	queries  *models.Queries
	sanitizer *bluemonday.Policy
}

func NewMessageService(q *models.Queries) *MessageService {
	return &MessageService{
		queries:   q,
		sanitizer: bluemonday.StrictPolicy(),
	}
}

func (s *MessageService) Queries() *models.Queries {
	return s.queries
}

func (s *MessageService) SendMessage(ctx context.Context, channelID, authorID uuid.UUID, content string, msgType ...string) (*models.Message, error) {
	content = s.sanitizer.Sanitize(strings.TrimSpace(content))

	mt := "text"
	if len(msgType) > 0 && msgType[0] != "" {
		mt = msgType[0]
	}

	// Allow empty content for sticker messages or messages with attachments
	if content == "" && mt == "text" {
		return nil, ErrEmptyMessage
	}

	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrChannelNotFound
		}
		return nil, err
	}

	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, authorID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	msg, err := s.queries.CreateMessage(ctx, models.CreateMessageParams{
		ChannelID: channelID,
		AuthorID:  authorID,
		Content:   content,
		Type:      mt,
	})
	if err != nil {
		return nil, err
	}

	return &msg, nil
}

func (s *MessageService) GetMessages(ctx context.Context, channelID, userID uuid.UUID, before *time.Time, limit int32) ([]models.MessageWithAuthor, error) {
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrChannelNotFound
		}
		return nil, err
	}

	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	if limit <= 0 || limit > 100 {
		limit = 50
	}

	return s.queries.GetChannelMessages(ctx, models.GetChannelMessagesParams{
		ChannelID: channelID,
		Before:    before,
		Limit:     limit,
	})
}

func (s *MessageService) UpdateMessage(ctx context.Context, messageID, userID uuid.UUID, content string) (*models.Message, error) {
	content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	if content == "" {
		return nil, ErrEmptyMessage
	}

	msg, err := s.queries.GetMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}

	if msg.AuthorID != userID {
		return nil, ErrNotAuthor
	}

	updated, err := s.queries.UpdateMessage(ctx, messageID, content)
	if err != nil {
		return nil, err
	}

	return &updated, nil
}

func (s *MessageService) GetMessageChannelID(ctx context.Context, messageID uuid.UUID) (uuid.UUID, error) {
	msg, err := s.queries.GetMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrMessageNotFound
		}
		return uuid.Nil, err
	}
	return msg.ChannelID, nil
}

func (s *MessageService) DeleteMessage(ctx context.Context, messageID, userID uuid.UUID) error {
	msg, err := s.queries.GetMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrMessageNotFound
		}
		return err
	}

	// Author can delete their own messages
	if msg.AuthorID == userID {
		return s.queries.DeleteMessage(ctx, messageID)
	}

	// Admins and owners can delete any message
	channel, err := s.queries.GetChannelByID(ctx, msg.ChannelID)
	if err != nil {
		return err
	}

	member, err := s.queries.GetServerMember(ctx, channel.ServerID, userID)
	if err != nil {
		return ErrNotMember
	}

	if member.Role != "owner" && member.Role != "admin" {
		return ErrNotAuthor
	}

	return s.queries.DeleteMessage(ctx, messageID)
}
