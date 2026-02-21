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
	ErrConversationNotFound = errors.New("conversation not found")
	ErrNotDMParticipant     = errors.New("not a participant of this conversation")
	ErrCannotDMSelf         = errors.New("cannot create a DM conversation with yourself")
	ErrMaxParticipants      = errors.New("group DM cannot have more than 25 participants")
	ErrAlreadyParticipant   = errors.New("user is already a participant")
	ErrNotGroupConversation = errors.New("not a group conversation")
	ErrInvalidGroupSize     = errors.New("group DM requires at least 2 other participants")
	ErrDMMessageNotFound       = errors.New("dm message not found")
	ErrNotDMMessageAuthor      = errors.New("not the author of this dm message")
	ErrConversationNotPending  = errors.New("conversation is not a pending message request")
)

type ConversationWithParticipants struct {
	models.DMConversation
	Participants []models.DMParticipantUser `json:"participants"`
}

type DMService struct {
	queries   *models.Queries
	sanitizer *bluemonday.Policy
}

func NewDMService(q *models.Queries) *DMService {
	return &DMService{
		queries:   q,
		sanitizer: bluemonday.StrictPolicy(),
	}
}

func (s *DMService) Queries() *models.Queries {
	return s.queries
}

func (s *DMService) CreateConversation(ctx context.Context, creatorID, participantID uuid.UUID) (*ConversationWithParticipants, error) {
	if creatorID == participantID {
		return nil, ErrCannotDMSelf
	}

	// Check if either user has blocked the other
	blocked, err := s.queries.IsBlocked(ctx, creatorID, participantID)
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, ErrUserBlocked
	}

	// Check for existing conversation (dedup)
	existingID, err := s.queries.FindExistingDMConversation(ctx, creatorID, participantID)
	if err == nil {
		conv, err := s.queries.GetDMConversationByID(ctx, existingID)
		if err != nil {
			return nil, err
		}
		participants, err := s.queries.GetDMParticipants(ctx, existingID)
		if err != nil {
			return nil, err
		}
		return &ConversationWithParticipants{
			DMConversation: conv,
			Participants:   participants,
		}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// Check if users are friends to determine accepted status
	accepted := true
	friendship, friendErr := s.queries.GetFriendshipBetween(ctx, creatorID, participantID)
	if friendErr != nil || friendship.Status != "accepted" {
		accepted = false
	}

	// Create new conversation
	conv, err := s.queries.CreateDMConversation(ctx, models.CreateDMConversationParams{
		IsGroup:  false,
		Name:     nil,
		Accepted: accepted,
	})
	if err != nil {
		return nil, err
	}

	if err := s.queries.AddDMParticipant(ctx, conv.ID, creatorID); err != nil {
		return nil, err
	}
	if err := s.queries.AddDMParticipant(ctx, conv.ID, participantID); err != nil {
		return nil, err
	}

	participants, err := s.queries.GetDMParticipants(ctx, conv.ID)
	if err != nil {
		return nil, err
	}

	return &ConversationWithParticipants{
		DMConversation: conv,
		Participants:   participants,
	}, nil
}

type SendDMOptions struct {
	MsgType   string
	ReplyToID *uuid.UUID
}

func (s *DMService) SendDM(ctx context.Context, conversationID, authorID uuid.UUID, content string, msgType ...string) (*models.DMMessage, error) {
	return s.SendDMWithOptions(ctx, conversationID, authorID, content, SendDMOptions{
		MsgType: func() string {
			if len(msgType) > 0 && msgType[0] != "" {
				return msgType[0]
			}
			return "text"
		}(),
	})
}

// isEncryptedPayload detects E2EE ciphertext envelope ({"v":1,"ct":"..."}).
func isEncryptedPayload(content string) bool {
	return len(content) > 10 && strings.HasPrefix(content, `{"v":1,`)
}

func (s *DMService) SendDMWithOptions(ctx context.Context, conversationID, authorID uuid.UUID, content string, opts SendDMOptions) (*models.DMMessage, error) {
	// Skip sanitization for encrypted payloads — ciphertext is opaque base64
	if !isEncryptedPayload(content) {
		content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	}

	if len(content) > 4000 {
		return nil, ErrMessageTooLong
	}

	mt := opts.MsgType
	if mt == "" {
		mt = "text"
	}

	if content == "" && mt == "text" {
		return nil, ErrEmptyMessage
	}

	// Verify conversation exists
	_, err := s.queries.GetDMConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}

	// Verify author is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, authorID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotDMParticipant
		}
		return nil, err
	}

	// Check if any participant has blocked the author (or vice versa)
	participants, pErr := s.queries.GetDMParticipants(ctx, conversationID)
	if pErr != nil {
		return nil, pErr
	}
	for _, p := range participants {
		if p.ID == authorID {
			continue
		}
		blocked, bErr := s.queries.IsBlocked(ctx, authorID, p.ID)
		if bErr != nil {
			return nil, bErr
		}
		if blocked {
			return nil, ErrUserBlocked
		}
	}

	msg, err := s.queries.CreateDMMessage(ctx, models.CreateDMMessageParams{
		ConversationID: conversationID,
		AuthorID:       authorID,
		Content:        content,
		Type:           mt,
		ReplyToID:      opts.ReplyToID,
	})
	if err != nil {
		return nil, err
	}

	return &msg, nil
}

func (s *DMService) GetConversations(ctx context.Context, userID uuid.UUID) ([]ConversationWithParticipants, error) {
	convos, err := s.queries.GetUserDMConversations(ctx, userID)
	if err != nil {
		return nil, err
	}

	result := make([]ConversationWithParticipants, 0, len(convos))
	for _, c := range convos {
		participants, err := s.queries.GetDMParticipants(ctx, c.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, ConversationWithParticipants{
			DMConversation: c,
			Participants:   participants,
		})
	}

	return result, nil
}

func (s *DMService) GetDMMessages(ctx context.Context, conversationID, userID uuid.UUID, before *time.Time, limit int32) ([]models.DMMessageWithAuthor, error) {
	// Verify conversation exists
	_, err := s.queries.GetDMConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}

	// Verify user is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotDMParticipant
		}
		return nil, err
	}

	if limit <= 0 || limit > 100 {
		limit = 50
	}

	return s.queries.GetDMMessages(ctx, models.GetDMMessagesParams{
		ConversationID: conversationID,
		Before:         before,
		Limit:          limit,
	})
}

func (s *DMService) GetDMMessagesAfter(ctx context.Context, conversationID, userID uuid.UUID, after time.Time, limit int32) ([]models.DMMessageWithAuthor, error) {
	// Verify conversation exists
	_, err := s.queries.GetDMConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}

	// Verify user is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotDMParticipant
		}
		return nil, err
	}

	if limit <= 0 || limit > 100 {
		limit = 50
	}

	return s.queries.GetDMMessagesAfter(ctx, models.GetDMMessagesAfterParams{
		ConversationID: conversationID,
		After:          after,
		Limit:          limit,
	})
}

func (s *DMService) AcceptMessageRequest(ctx context.Context, conversationID, userID uuid.UUID) error {
	// Verify conversation exists
	conv, err := s.queries.GetDMConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConversationNotFound
		}
		return err
	}

	if conv.Accepted {
		return ErrConversationNotPending
	}

	// Verify user is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotDMParticipant
		}
		return err
	}

	return s.queries.AcceptDMConversation(ctx, conversationID)
}

func (s *DMService) DeclineMessageRequest(ctx context.Context, conversationID, userID uuid.UUID) error {
	// Verify conversation exists
	conv, err := s.queries.GetDMConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConversationNotFound
		}
		return err
	}

	if conv.Accepted {
		return ErrConversationNotPending
	}

	// Verify user is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotDMParticipant
		}
		return err
	}

	return s.queries.DeleteDMConversation(ctx, conversationID)
}

func (s *DMService) GetParticipantIDs(ctx context.Context, conversationID uuid.UUID) ([]uuid.UUID, error) {
	participants, err := s.queries.GetDMParticipants(ctx, conversationID)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, len(participants))
	for i, p := range participants {
		ids[i] = p.ID
	}
	return ids, nil
}

func (s *DMService) CreateGroupConversation(ctx context.Context, creatorID uuid.UUID, participantIDs []uuid.UUID) (*ConversationWithParticipants, error) {
	if len(participantIDs) < 2 {
		return nil, ErrInvalidGroupSize
	}

	// Total = creator + participants
	if len(participantIDs)+1 > 25 {
		return nil, ErrMaxParticipants
	}

	// Remove duplicates and self
	seen := map[uuid.UUID]bool{creatorID: true}
	var uniqueIDs []uuid.UUID
	for _, id := range participantIDs {
		if !seen[id] {
			seen[id] = true
			uniqueIDs = append(uniqueIDs, id)
		}
	}

	if len(uniqueIDs) < 2 {
		return nil, ErrInvalidGroupSize
	}

	conv, err := s.queries.CreateDMConversation(ctx, models.CreateDMConversationParams{
		IsGroup: true,
		Name:    nil,
	})
	if err != nil {
		return nil, err
	}

	// Add creator
	if err := s.queries.AddDMParticipant(ctx, conv.ID, creatorID); err != nil {
		return nil, err
	}

	// Add other participants
	for _, pid := range uniqueIDs {
		if err := s.queries.AddDMParticipant(ctx, conv.ID, pid); err != nil {
			return nil, err
		}
	}

	participants, err := s.queries.GetDMParticipants(ctx, conv.ID)
	if err != nil {
		return nil, err
	}

	return &ConversationWithParticipants{
		DMConversation: conv,
		Participants:   participants,
	}, nil
}

func (s *DMService) AddParticipant(ctx context.Context, conversationID, userID, addedByID uuid.UUID) error {
	// Verify conversation exists and is a group
	conv, err := s.queries.GetDMConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConversationNotFound
		}
		return err
	}
	if !conv.IsGroup {
		return ErrNotGroupConversation
	}

	// Verify adder is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, addedByID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotDMParticipant
		}
		return err
	}

	// Check max participants
	count, err := s.queries.GetDMParticipantCount(ctx, conversationID)
	if err != nil {
		return err
	}
	if count >= 25 {
		return ErrMaxParticipants
	}

	// Check if user is already a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, userID)
	if err == nil {
		return ErrAlreadyParticipant
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	return s.queries.AddDMParticipant(ctx, conversationID, userID)
}

func (s *DMService) RemoveParticipant(ctx context.Context, conversationID, targetUserID, removedByID uuid.UUID) error {
	// Verify conversation exists and is a group
	conv, err := s.queries.GetDMConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConversationNotFound
		}
		return err
	}
	if !conv.IsGroup {
		return ErrNotGroupConversation
	}

	// Verify remover is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, removedByID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotDMParticipant
		}
		return err
	}

	// Verify target is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, targetUserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotDMParticipant
		}
		return err
	}

	return s.queries.RemoveDMParticipant(ctx, conversationID, targetUserID)
}

func (s *DMService) verifyDMParticipant(ctx context.Context, conversationID, userID uuid.UUID) error {
	_, err := s.queries.GetDMParticipant(ctx, conversationID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotDMParticipant
		}
		return err
	}
	return nil
}

func (s *DMService) EditDMMessage(ctx context.Context, messageID, userID uuid.UUID, content string) (*models.DMMessage, error) {
	msg, err := s.queries.GetDMMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDMMessageNotFound
		}
		return nil, err
	}

	if msg.AuthorID != userID {
		return nil, ErrNotDMMessageAuthor
	}

	// Skip sanitization for encrypted payloads
	if !isEncryptedPayload(content) {
		content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	}
	if content == "" {
		return nil, ErrEmptyMessage
	}
	if len(content) > 4000 {
		return nil, ErrMessageTooLong
	}

	// Save old content to edits
	if err := s.queries.CreateDMMessageEdit(ctx, messageID, msg.Content); err != nil {
		return nil, err
	}

	if err := s.queries.UpdateDMMessage(ctx, messageID, content); err != nil {
		return nil, err
	}

	updated, err := s.queries.GetDMMessageByID(ctx, messageID)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func (s *DMService) DeleteDMMessage(ctx context.Context, messageID, userID uuid.UUID) (uuid.UUID, error) {
	msg, err := s.queries.GetDMMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrDMMessageNotFound
		}
		return uuid.Nil, err
	}

	if msg.AuthorID != userID {
		return uuid.Nil, ErrNotDMMessageAuthor
	}

	if err := s.queries.DeleteDMMessage(ctx, messageID); err != nil {
		return uuid.Nil, err
	}
	return msg.ConversationID, nil
}

func (s *DMService) AddDMReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) (uuid.UUID, error) {
	msg, err := s.queries.GetDMMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrDMMessageNotFound
		}
		return uuid.Nil, err
	}

	if err := s.verifyDMParticipant(ctx, msg.ConversationID, userID); err != nil {
		return uuid.Nil, err
	}

	if err := s.queries.AddDMReaction(ctx, messageID, userID, emoji); err != nil {
		return uuid.Nil, err
	}
	return msg.ConversationID, nil
}

func (s *DMService) RemoveDMReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) (uuid.UUID, error) {
	msg, err := s.queries.GetDMMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrDMMessageNotFound
		}
		return uuid.Nil, err
	}

	if err := s.verifyDMParticipant(ctx, msg.ConversationID, userID); err != nil {
		return uuid.Nil, err
	}

	if err := s.queries.RemoveDMReaction(ctx, messageID, userID, emoji); err != nil {
		return uuid.Nil, err
	}
	return msg.ConversationID, nil
}

func (s *DMService) PinDMMessage(ctx context.Context, conversationID, messageID, userID uuid.UUID) error {
	if err := s.verifyDMParticipant(ctx, conversationID, userID); err != nil {
		return err
	}

	// Verify message belongs to this conversation
	msg, err := s.queries.GetDMMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrDMMessageNotFound
		}
		return err
	}
	if msg.ConversationID != conversationID {
		return ErrDMMessageNotFound
	}

	return s.queries.PinDMMessage(ctx, conversationID, messageID, userID)
}

func (s *DMService) UnpinDMMessage(ctx context.Context, conversationID, messageID, userID uuid.UUID) error {
	if err := s.verifyDMParticipant(ctx, conversationID, userID); err != nil {
		return err
	}

	return s.queries.UnpinDMMessage(ctx, conversationID, messageID)
}

func (s *DMService) GetDMPinnedMessages(ctx context.Context, conversationID, userID uuid.UUID) ([]models.DMMessageWithAuthor, error) {
	if err := s.verifyDMParticipant(ctx, conversationID, userID); err != nil {
		return nil, err
	}

	return s.queries.GetDMPinnedMessages(ctx, conversationID)
}

func (s *DMService) GetDMEditHistory(ctx context.Context, messageID, userID uuid.UUID) ([]models.DMMessageEdit, error) {
	msg, err := s.queries.GetDMMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDMMessageNotFound
		}
		return nil, err
	}

	if err := s.verifyDMParticipant(ctx, msg.ConversationID, userID); err != nil {
		return nil, err
	}

	return s.queries.GetDMMessageEdits(ctx, messageID)
}

func (s *DMService) RenameConversation(ctx context.Context, conversationID, userID uuid.UUID, name string) error {
	// Verify conversation exists and is a group
	conv, err := s.queries.GetDMConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConversationNotFound
		}
		return err
	}
	if !conv.IsGroup {
		return ErrNotGroupConversation
	}

	// Verify user is a participant
	_, err = s.queries.GetDMParticipant(ctx, conversationID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotDMParticipant
		}
		return err
	}

	sanitized := s.sanitizer.Sanitize(strings.TrimSpace(name))
	var namePtr *string
	if sanitized != "" {
		namePtr = &sanitized
	}

	return s.queries.UpdateDMConversationName(ctx, conversationID, namePtr)
}
