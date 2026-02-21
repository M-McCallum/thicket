package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrEventNotFound     = errors.New("event not found")
	ErrInvalidEventName  = errors.New("event name must be 1-100 characters")
	ErrInvalidStartTime  = errors.New("start time must be in the future")
	ErrInvalidLocationType = errors.New("location_type must be 'voice', 'stage', or 'external'")
)

type EventService struct {
	queries *models.Queries
}

func NewEventService(q *models.Queries) *EventService {
	return &EventService{queries: q}
}

func (s *EventService) CreateEvent(ctx context.Context, serverID, creatorID uuid.UUID, name, description, locationType string, channelID *uuid.UUID, externalLocation string, startTime time.Time, endTime *time.Time, imageURL *string) (*models.ServerEvent, error) {
	if len(name) < 1 || len(name) > 100 {
		return nil, ErrInvalidEventName
	}

	if locationType != "voice" && locationType != "stage" && locationType != "external" {
		return nil, ErrInvalidLocationType
	}

	event, err := s.queries.CreateEvent(ctx, models.CreateEventParams{
		ServerID:         serverID,
		CreatorID:        creatorID,
		Name:             name,
		Description:      description,
		LocationType:     locationType,
		ChannelID:        channelID,
		ExternalLocation: externalLocation,
		StartTime:        startTime,
		EndTime:          endTime,
		ImageURL:         imageURL,
	})
	if err != nil {
		return nil, err
	}

	return &event, nil
}

func (s *EventService) GetServerEvents(ctx context.Context, serverID, userID uuid.UUID) ([]models.ServerEventWithRSVP, error) {
	return s.queries.GetServerEvents(ctx, serverID, userID)
}

func (s *EventService) GetEvent(ctx context.Context, eventID, userID uuid.UUID) (*models.ServerEventWithRSVP, error) {
	event, err := s.queries.GetEventWithRSVP(ctx, eventID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrEventNotFound
		}
		return nil, err
	}
	return &event, nil
}

func (s *EventService) UpdateEvent(ctx context.Context, eventID, userID uuid.UUID, arg models.UpdateEventParams) (*models.ServerEvent, error) {
	existing, err := s.queries.GetEventByID(ctx, eventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrEventNotFound
		}
		return nil, err
	}

	// Only creator can update
	if existing.CreatorID != userID {
		return nil, ErrInsufficientRole
	}

	if arg.Name != nil && (len(*arg.Name) < 1 || len(*arg.Name) > 100) {
		return nil, ErrInvalidEventName
	}

	arg.ID = eventID
	event, err := s.queries.UpdateEvent(ctx, arg)
	if err != nil {
		return nil, err
	}

	return &event, nil
}

func (s *EventService) DeleteEvent(ctx context.Context, eventID, userID uuid.UUID) error {
	existing, err := s.queries.GetEventByID(ctx, eventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrEventNotFound
		}
		return err
	}

	// Only creator can delete
	if existing.CreatorID != userID {
		return ErrInsufficientRole
	}

	return s.queries.DeleteEvent(ctx, eventID)
}

func (s *EventService) RSVP(ctx context.Context, eventID, userID uuid.UUID, status string) error {
	if status != "interested" && status != "going" {
		return errors.New("RSVP status must be 'interested' or 'going'")
	}

	// Verify event exists
	_, err := s.queries.GetEventByID(ctx, eventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrEventNotFound
		}
		return err
	}

	return s.queries.UpsertEventRSVP(ctx, eventID, userID, status)
}

func (s *EventService) RemoveRSVP(ctx context.Context, eventID, userID uuid.UUID) error {
	return s.queries.DeleteEventRSVP(ctx, eventID, userID)
}
