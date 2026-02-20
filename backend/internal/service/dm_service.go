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

	// Create new conversation
	conv, err := s.queries.CreateDMConversation(ctx, models.CreateDMConversationParams{
		IsGroup: false,
		Name:    nil,
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

func (s *DMService) SendDM(ctx context.Context, conversationID, authorID uuid.UUID, content string, msgType ...string) (*models.DMMessage, error) {
	content = s.sanitizer.Sanitize(strings.TrimSpace(content))

	mt := "text"
	if len(msgType) > 0 && msgType[0] != "" {
		mt = msgType[0]
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

	msg, err := s.queries.CreateDMMessage(ctx, models.CreateDMMessageParams{
		ConversationID: conversationID,
		AuthorID:       authorID,
		Content:        content,
		Type:           mt,
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
