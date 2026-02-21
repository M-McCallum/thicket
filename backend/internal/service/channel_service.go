package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrChannelNotFound    = errors.New("channel not found")
	ErrInvalidChannelName = errors.New("channel name must be 1-100 characters")
	ErrInvalidChannelType = errors.New("channel type must be 'text', 'voice', or 'forum'")
)

type ChannelService struct {
	queries *models.Queries
	permSvc *PermissionService
}

func NewChannelService(q *models.Queries, permSvc *PermissionService) *ChannelService {
	return &ChannelService{queries: q, permSvc: permSvc}
}

func (s *ChannelService) CreateChannel(ctx context.Context, serverID, userID uuid.UUID, name, channelType string, isAnnouncement ...bool) (*models.Channel, error) {
	if len(name) < 1 || len(name) > 100 {
		return nil, ErrInvalidChannelName
	}
	if channelType != "text" && channelType != "voice" && channelType != "forum" {
		return nil, ErrInvalidChannelType
	}

	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageChannels)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	channels, err := s.queries.GetServerChannels(ctx, serverID)
	if err != nil {
		return nil, err
	}

	announce := false
	if len(isAnnouncement) > 0 {
		announce = isAnnouncement[0]
	}
	// Only text channels can be announcement channels
	if announce && channelType != "text" {
		announce = false
	}

	channel, err := s.queries.CreateChannel(ctx, models.CreateChannelParams{
		ServerID:       serverID,
		Name:           name,
		Type:           channelType,
		Position:       int32(len(channels)),
		IsAnnouncement: announce,
	})
	if err != nil {
		return nil, err
	}

	return &channel, nil
}

func (s *ChannelService) GetChannels(ctx context.Context, serverID, userID uuid.UUID) ([]models.Channel, error) {
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	return s.queries.GetServerChannels(ctx, serverID)
}

func (s *ChannelService) DeleteChannel(ctx context.Context, channelID, userID uuid.UUID) error {
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

	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	return s.queries.DeleteChannel(ctx, channelID)
}
