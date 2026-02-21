package service

import (
	"context"
	"errors"
	"fmt"
	"math"
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

// SlowModeError is returned when a user sends messages too quickly in a slow-mode channel.
type SlowModeError struct {
	RetryAfter int
}

func (e *SlowModeError) Error() string {
	return fmt.Sprintf("slow mode: retry after %ds", e.RetryAfter)
}

var (
	ErrMessageNotFound   = errors.New("message not found")
	ErrNotAuthor         = errors.New("not the author of this message")
	ErrEmptyMessage      = errors.New("message content cannot be empty")
	ErrTooManyPins       = errors.New("channel has reached the pin limit (50)")
	ErrMessageNotInChannel = errors.New("message does not belong to this channel")
	ErrReplyNotInChannel = errors.New("reply target is not in the same channel")
	ErrGifsDisabled      = errors.New("GIFs are disabled in this server")
	ErrUserTimedOut      = errors.New("you are timed out in this server")
	ErrAutoModBlocked    = errors.New("message blocked by automod")
	ErrMessageTooLong    = errors.New("message content cannot exceed 4000 characters")
)

const MaxMessageLength = 4000

type MessageService struct {
	queries    *models.Queries
	permSvc    *PermissionService
	automodSvc *AutoModService
	sanitizer  *bluemonday.Policy
}

func NewMessageService(q *models.Queries, permSvc *PermissionService) *MessageService {
	return &MessageService{
		queries:   q,
		permSvc:   permSvc,
		sanitizer: bluemonday.StrictPolicy(),
	}
}

// SetAutoModService sets the automod service for message checking.
func (s *MessageService) SetAutoModService(as *AutoModService) {
	s.automodSvc = as
}

func (s *MessageService) Queries() *models.Queries {
	return s.queries
}

func (s *MessageService) SendMessage(ctx context.Context, channelID, authorID uuid.UUID, content string, replyToID *uuid.UUID, msgType ...string) (*models.Message, error) {
	content = s.sanitizer.Sanitize(strings.TrimSpace(content))

	if len(content) > MaxMessageLength {
		return nil, ErrMessageTooLong
	}

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

	// Enforce slow mode
	if channel.SlowModeInterval > 0 {
		// Exempt users with ManageMessages or ManageChannels
		canBypass := false
		if ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, authorID, models.PermManageMessages); err == nil && ok {
			canBypass = true
		}
		if !canBypass {
			if ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, authorID, models.PermManageChannels); err == nil && ok {
				canBypass = true
			}
		}
		if !canBypass {
			lastTime, err := s.queries.GetLastUserMessageTime(ctx, channelID, authorID)
			if err != nil {
				return nil, err
			}
			if lastTime != nil {
				elapsed := time.Since(*lastTime).Seconds()
				remaining := float64(channel.SlowModeInterval) - elapsed
				if remaining > 0 {
					return nil, &SlowModeError{RetryAfter: int(math.Ceil(remaining))}
				}
			}
		}
	}

	// Check if GIFs are disabled for this server
	if mt == "gif" {
		server, err := s.queries.GetServerByID(ctx, channel.ServerID)
		if err != nil {
			return nil, err
		}
		if !server.GifsEnabled {
			return nil, ErrGifsDisabled
		}
	}

	// Check if user is timed out
	if timedOut, err := s.queries.IsUserTimedOut(ctx, channel.ServerID, authorID); err == nil && timedOut {
		return nil, ErrUserTimedOut
	}

	// AutoMod check — before persisting the message
	if s.automodSvc != nil && content != "" {
		action, err := s.automodSvc.CheckMessage(ctx, channel.ServerID, channelID, authorID, content)
		if err != nil {
			return nil, err
		}
		if action != nil && action.Triggered {
			if action.Action == "delete" {
				s.automodSvc.ExecuteAction(ctx, action, channel.ServerID, channelID, authorID, content)
				return nil, ErrAutoModBlocked
			}
			// For timeout and alert, we still save the message but execute the action after
			defer func() {
				s.automodSvc.ExecuteAction(ctx, action, channel.ServerID, channelID, authorID, content)
			}()
		}
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

// CrossPostMessage creates cross-posted copies in all channels following the given announcement channel.
// Returns the cross-posted messages (one per follower channel).
func (s *MessageService) CrossPostMessage(ctx context.Context, sourceChannel models.Channel, originalMsg *models.Message) ([]models.Message, error) {
	if !sourceChannel.IsAnnouncement {
		return nil, nil
	}

	followers, err := s.queries.GetChannelFollowers(ctx, sourceChannel.ID)
	if err != nil {
		return nil, err
	}
	if len(followers) == 0 {
		return nil, nil
	}

	crossPostContent := "[Cross-posted from #" + sourceChannel.Name + "]\n" + originalMsg.Content

	var crossPosts []models.Message
	for _, follow := range followers {
		crossMsg, err := s.queries.CreateMessage(ctx, models.CreateMessageParams{
			ChannelID: follow.TargetChannelID,
			AuthorID:  originalMsg.AuthorID,
			Content:   crossPostContent,
			Type:      originalMsg.Type,
		})
		if err != nil {
			continue // best-effort: skip failures for individual channels
		}
		crossPosts = append(crossPosts, crossMsg)
	}

	return crossPosts, nil
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

	msgs, err := s.queries.GetChannelMessages(ctx, models.GetChannelMessagesParams{
		ChannelID: channelID,
		Before:    before,
		Limit:     limit,
	})
	if err != nil {
		return nil, err
	}

	return s.filterBlockedMessages(ctx, userID, msgs)
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

	msgs, err := s.queries.GetChannelMessagesAfter(ctx, models.GetChannelMessagesAfterParams{
		ChannelID: channelID,
		After:     after,
		Limit:     limit,
	})
	if err != nil {
		return nil, err
	}

	return s.filterBlockedMessages(ctx, userID, msgs)
}

func (s *MessageService) UpdateMessage(ctx context.Context, messageID, userID uuid.UUID, content string) (*models.Message, error) {
	content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	if content == "" {
		return nil, ErrEmptyMessage
	}
	if len(content) > MaxMessageLength {
		return nil, ErrMessageTooLong
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

// filterBlockedMessages removes messages authored by users that the requesting user has blocked.
func (s *MessageService) filterBlockedMessages(ctx context.Context, requestingUserID uuid.UUID, msgs []models.MessageWithAuthor) ([]models.MessageWithAuthor, error) {
	blockedIDs, err := s.queries.GetBlockedUserIDs(ctx, requestingUserID)
	if err != nil {
		return nil, err
	}
	if len(blockedIDs) == 0 {
		return msgs, nil
	}

	blocked := make(map[uuid.UUID]bool, len(blockedIDs))
	for _, id := range blockedIDs {
		blocked[id] = true
	}

	filtered := make([]models.MessageWithAuthor, 0, len(msgs))
	for _, m := range msgs {
		if !blocked[m.AuthorID] {
			filtered = append(filtered, m)
		}
	}
	return filtered, nil
}
