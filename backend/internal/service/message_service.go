package service

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/microcosm-cc/bluemonday"

	"github.com/M-McCallum/thicket/internal/models"
)

var mentionRegex = regexp.MustCompile(`<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>`)

func ParseMentions(content string) []uuid.UUID {
	matches := mentionRegex.FindAllStringSubmatch(content, -1)
	seen := make(map[uuid.UUID]bool)
	var ids []uuid.UUID
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		id, err := uuid.Parse(match[1])
		if err != nil {
			continue
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	return ids
}

var (
	ErrMessageNotFound   = errors.New("message not found")
	ErrNotAuthor         = errors.New("not the author of this message")
	ErrEmptyMessage      = errors.New("message content cannot be empty")
	ErrTooManyPins       = errors.New("channel has reached the pin limit (50)")
	ErrMessageNotInChannel = errors.New("message does not belong to this channel")
	ErrReplyNotInChannel = errors.New("reply target is not in the same channel")
)

type MessageService struct {
	queries   *models.Queries
	permSvc   *PermissionService
	sanitizer *bluemonday.Policy
}

func NewMessageService(q *models.Queries, permSvc *PermissionService) *MessageService {
	return &MessageService{
		queries:   q,
		permSvc:   permSvc,
		sanitizer: bluemonday.StrictPolicy(),
	}
}

func (s *MessageService) Queries() *models.Queries {
	return s.queries
}

func (s *MessageService) SendMessage(ctx context.Context, channelID, authorID uuid.UUID, content string, replyToID *uuid.UUID, msgType ...string) (*models.Message, error) {
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

	// Validate reply target
	if replyToID != nil {
		replyMsg, err := s.queries.GetMessageByID(ctx, *replyToID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrMessageNotFound
			}
			return nil, err
		}
		if replyMsg.ChannelID != channelID {
			return nil, ErrReplyNotInChannel
		}
	}

	msg, err := s.queries.CreateMessage(ctx, models.CreateMessageParams{
		ChannelID: channelID,
		AuthorID:  authorID,
		Content:   content,
		Type:      mt,
		ReplyToID: replyToID,
	})
	if err != nil {
		return nil, err
	}

	// Parse mentions and create notifications
	mentionedIDs := ParseMentions(content)
	if len(mentionedIDs) > 0 {
		for _, mentionedID := range mentionedIDs {
			if mentionedID != authorID { // Don't notify yourself
				_ = s.queries.CreateMentionNotification(ctx, mentionedID, msg.ID, channelID, channel.ServerID)
			}
		}
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

func (s *MessageService) GetMessagesAfter(ctx context.Context, channelID, userID uuid.UUID, after time.Time, limit int32) ([]models.MessageWithAuthor, error) {
	// Verify membership
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

	return s.queries.GetChannelMessagesAfter(ctx, models.GetChannelMessagesAfterParams{
		ChannelID: channelID,
		After:     after,
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

	// Save old content to edit history
	_ = s.queries.InsertMessageEdit(ctx, messageID, msg.Content)

	updated, err := s.queries.UpdateMessage(ctx, messageID, content)
	if err != nil {
		return nil, err
	}

	return &updated, nil
}

func (s *MessageService) GetEditHistory(ctx context.Context, messageID, userID uuid.UUID) ([]models.MessageEdit, error) {
	// Verify the message exists and user is a member of the channel's server
	msg, err := s.queries.GetMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}

	channel, err := s.queries.GetChannelByID(ctx, msg.ChannelID)
	if err != nil {
		return nil, err
	}

	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	return s.queries.GetMessageEdits(ctx, messageID)
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

	// Users with MANAGE_MESSAGES can delete any message
	channel, err := s.queries.GetChannelByID(ctx, msg.ChannelID)
	if err != nil {
		return err
	}

	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageMessages)
	if err != nil {
		return ErrNotMember
	}
	if !ok {
		return ErrNotAuthor
	}

	return s.queries.DeleteMessage(ctx, messageID)
}

// Pin operations

func (s *MessageService) PinMessage(ctx context.Context, channelID, messageID, userID uuid.UUID) error {
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrChannelNotFound
		}
		return err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}
	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermPinMessages)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}
	msg, err := s.queries.GetMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrMessageNotFound
		}
		return err
	}
	if msg.ChannelID != channelID {
		return ErrMessageNotInChannel
	}
	count, err := s.queries.GetPinnedMessageCount(ctx, channelID)
	if err != nil {
		return err
	}
	if count >= 50 {
		return ErrTooManyPins
	}
	return s.queries.PinMessage(ctx, channelID, messageID, userID)
}

func (s *MessageService) UnpinMessage(ctx context.Context, channelID, messageID, userID uuid.UUID) error {
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrChannelNotFound
		}
		return err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}
	return s.queries.UnpinMessage(ctx, channelID, messageID)
}

func (s *MessageService) GetPinnedMessages(ctx context.Context, channelID, userID uuid.UUID) ([]models.MessageWithAuthor, error) {
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
	return s.queries.GetPinnedMessages(ctx, channelID)
}

// Reaction operations

func (s *MessageService) AddReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) (*models.Message, error) {
	msg, err := s.queries.GetMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}
	channel, err := s.queries.GetChannelByID(ctx, msg.ChannelID)
	if err != nil {
		return nil, err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}
	if err := s.queries.AddReaction(ctx, messageID, userID, emoji); err != nil {
		return nil, err
	}
	return &msg, nil
}

func (s *MessageService) RemoveReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) (*models.Message, error) {
	msg, err := s.queries.GetMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}
	channel, err := s.queries.GetChannelByID(ctx, msg.ChannelID)
	if err != nil {
		return nil, err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}
	if err := s.queries.RemoveReaction(ctx, messageID, userID, emoji); err != nil {
		return nil, err
	}
	return &msg, nil
}

func (s *MessageService) AttachReactionsToMessages(ctx context.Context, messages []models.MessageWithAuthor, currentUserID uuid.UUID) error {
	if len(messages) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(messages))
	for i, m := range messages {
		ids[i] = m.ID
	}
	rows, err := s.queries.GetReactionsForMessages(ctx, ids)
	if err != nil {
		return err
	}
	byMsg := make(map[uuid.UUID][]models.ReactionCount)
	for _, r := range rows {
		me := false
		for _, uid := range r.UserIDs {
			if uid == currentUserID {
				me = true
				break
			}
		}
		byMsg[r.MessageID] = append(byMsg[r.MessageID], models.ReactionCount{
			Emoji: r.Emoji,
			Count: r.Count,
			Me:    me,
		})
	}
	for i := range messages {
		if rc, ok := byMsg[messages[i].ID]; ok {
			messages[i].Reactions = rc
		}
	}
	return nil
}
