package service

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/microcosm-cc/bluemonday"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrScheduledMessageNotFound = errors.New("scheduled message not found")
	ErrNotScheduleAuthor        = errors.New("not the author of this scheduled message")
	ErrScheduleInPast           = errors.New("scheduled time must be in the future")
	ErrNoTarget                 = errors.New("channel_id or dm_conversation_id is required")
)

type SchedulerService struct {
	queries    *models.Queries
	messageSvc *MessageService
	dmSvc      *DMService
	sanitizer  *bluemonday.Policy
}

func NewSchedulerService(q *models.Queries, messageSvc *MessageService, dmSvc *DMService) *SchedulerService {
	return &SchedulerService{
		queries:    q,
		messageSvc: messageSvc,
		dmSvc:      dmSvc,
		sanitizer:  bluemonday.StrictPolicy(),
	}
}

// Start launches a background goroutine that processes due scheduled messages every 10 seconds.
func (s *SchedulerService) Start() {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.processDueMessages()
		}
	}()
}

func (s *SchedulerService) processDueMessages() {
	ctx := context.Background()
	due, err := s.queries.GetDueScheduledMessages(ctx)
	if err != nil {
		log.Printf("scheduler: failed to fetch due messages: %v", err)
		return
	}

	for _, sm := range due {
		if sm.ChannelID != nil {
			_, err = s.messageSvc.SendMessage(ctx, *sm.ChannelID, sm.AuthorID, sm.Content, nil, sm.Type)
		} else if sm.DMConversationID != nil {
			_, err = s.dmSvc.SendDM(ctx, *sm.DMConversationID, sm.AuthorID, sm.Content, sm.Type)
		}
		if err != nil {
			log.Printf("scheduler: failed to send scheduled message %s: %v", sm.ID, err)
			continue
		}
		if err := s.queries.MarkScheduledMessageSent(ctx, sm.ID); err != nil {
			log.Printf("scheduler: failed to mark message %s as sent: %v", sm.ID, err)
		}
	}
}

func (s *SchedulerService) CreateScheduledMessage(ctx context.Context, authorID uuid.UUID, channelID, dmConversationID *uuid.UUID, content, msgType string, scheduledAt time.Time) (*models.ScheduledMessage, error) {
	content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	if content == "" {
		return nil, ErrEmptyMessage
	}
	if channelID == nil && dmConversationID == nil {
		return nil, ErrNoTarget
	}
	if scheduledAt.Before(time.Now()) {
		return nil, ErrScheduleInPast
	}
	if msgType == "" {
		msgType = "text"
	}

	msg, err := s.queries.CreateScheduledMessage(ctx, models.CreateScheduledMessageParams{
		ChannelID:        channelID,
		DMConversationID: dmConversationID,
		AuthorID:         authorID,
		Content:          content,
		Type:             msgType,
		ScheduledAt:      scheduledAt,
	})
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

func (s *SchedulerService) GetScheduledMessages(ctx context.Context, userID uuid.UUID) ([]models.ScheduledMessage, error) {
	return s.queries.GetScheduledMessagesByUser(ctx, userID)
}

func (s *SchedulerService) UpdateScheduledMessage(ctx context.Context, id, userID uuid.UUID, content string, scheduledAt time.Time) (*models.ScheduledMessage, error) {
	existing, err := s.queries.GetScheduledMessageByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrScheduledMessageNotFound
		}
		return nil, err
	}
	if existing.AuthorID != userID {
		return nil, ErrNotScheduleAuthor
	}
	if existing.Sent {
		return nil, ErrScheduledMessageNotFound
	}

	content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	if content == "" {
		return nil, ErrEmptyMessage
	}
	if scheduledAt.Before(time.Now()) {
		return nil, ErrScheduleInPast
	}

	msg, err := s.queries.UpdateScheduledMessage(ctx, id, content, scheduledAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrScheduledMessageNotFound
		}
		return nil, err
	}
	return &msg, nil
}

func (s *SchedulerService) DeleteScheduledMessage(ctx context.Context, id, userID uuid.UUID) error {
	existing, err := s.queries.GetScheduledMessageByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrScheduledMessageNotFound
		}
		return err
	}
	if existing.AuthorID != userID {
		return ErrNotScheduleAuthor
	}
	return s.queries.DeleteScheduledMessage(ctx, id)
}
