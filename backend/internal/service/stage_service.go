package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrStageAlreadyActive = errors.New("stage is already active on this channel")
	ErrStageNotActive     = errors.New("no active stage on this channel")
	ErrNotInvited         = errors.New("you have not been invited to speak")
	ErrAlreadySpeaker     = errors.New("user is already a speaker")
)

type StageService struct {
	queries *models.Queries
	permSvc *PermissionService
}

func NewStageService(q *models.Queries, permSvc *PermissionService) *StageService {
	return &StageService{queries: q, permSvc: permSvc}
}

// StartStage creates a new stage instance. The starter is automatically added as a speaker.
func (s *StageService) StartStage(ctx context.Context, channelID, userID uuid.UUID, topic string) (*models.StageInstance, error) {
	// Verify channel exists and get server ID for permission check
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrChannelNotFound
		}
		return nil, err
	}

	// Check membership
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	// Check ManageChannels permission
	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	// Check no active stage
	if _, err := s.queries.GetStageInstance(ctx, channelID); err == nil {
		return nil, ErrStageAlreadyActive
	}

	instance, err := s.queries.CreateStageInstance(ctx, channelID, userID, topic)
	if err != nil {
		return nil, err
	}

	// Add the starter as a speaker
	_, _ = s.queries.AddStageSpeaker(ctx, channelID, userID, false)

	return &instance, nil
}

// EndStage removes the stage instance and all associated speakers/hand raises.
func (s *StageService) EndStage(ctx context.Context, channelID, userID uuid.UUID) error {
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

	// Must have ManageChannels or be the one who started it
	instance, err := s.queries.GetStageInstance(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrStageNotActive
		}
		return err
	}

	if instance.StartedBy != userID {
		ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
		if err != nil {
			return err
		}
		if !ok {
			return ErrInsufficientRole
		}
	}

	// Clean up all stage data
	_ = s.queries.DeleteStageHandRaisesByChannel(ctx, channelID)
	_ = s.queries.DeleteStageSpeakersByChannel(ctx, channelID)
	return s.queries.DeleteStageInstance(ctx, channelID)
}

// AddSpeaker adds oneself as a speaker (must have been invited).
func (s *StageService) AddSpeaker(ctx context.Context, channelID, userID uuid.UUID) (*models.StageSpeaker, error) {
	// Verify stage is active
	if _, err := s.queries.GetStageInstance(ctx, channelID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStageNotActive
		}
		return nil, err
	}

	// Check if already a speaker
	isSpeaker, err := s.queries.IsStageSpeaker(ctx, channelID, userID)
	if err != nil {
		return nil, err
	}
	if isSpeaker {
		return nil, ErrAlreadySpeaker
	}

	// For self-add: must check the speaker row exists with invited=true
	// We look for an invited entry (set by InviteToSpeak)
	speakers, err := s.queries.GetStageSpeakers(ctx, channelID)
	if err != nil {
		return nil, err
	}
	invited := false
	for _, sp := range speakers {
		if sp.UserID == userID && sp.Invited {
			invited = true
			break
		}
	}
	if !invited {
		return nil, ErrNotInvited
	}

	speaker, err := s.queries.AddStageSpeaker(ctx, channelID, userID, false)
	if err != nil {
		return nil, err
	}

	// Remove hand raise if any
	_ = s.queries.RemoveStageHandRaise(ctx, channelID, userID)

	return &speaker, nil
}

// RemoveSpeaker removes a speaker. Moderators can remove anyone; speakers can remove themselves.
func (s *StageService) RemoveSpeaker(ctx context.Context, channelID, targetUserID, actingUserID uuid.UUID) error {
	if _, err := s.queries.GetStageInstance(ctx, channelID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrStageNotActive
		}
		return err
	}

	// If removing someone else, need ManageChannels
	if targetUserID != actingUserID {
		channel, err := s.queries.GetChannelByID(ctx, channelID)
		if err != nil {
			return err
		}
		ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, actingUserID, models.PermManageChannels)
		if err != nil {
			return err
		}
		if !ok {
			return ErrInsufficientRole
		}
	}

	return s.queries.RemoveStageSpeaker(ctx, channelID, targetUserID)
}

// RaiseHand records a hand raise from an audience member.
func (s *StageService) RaiseHand(ctx context.Context, channelID, userID uuid.UUID) (*models.StageHandRaise, error) {
	if _, err := s.queries.GetStageInstance(ctx, channelID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStageNotActive
		}
		return nil, err
	}

	raise, err := s.queries.AddStageHandRaise(ctx, channelID, userID)
	if err != nil {
		// ON CONFLICT DO NOTHING returns no rows — treat as already raised
		if errors.Is(err, pgx.ErrNoRows) {
			return &models.StageHandRaise{ChannelID: channelID, UserID: userID}, nil
		}
		return nil, err
	}
	return &raise, nil
}

// LowerHand removes a hand raise.
func (s *StageService) LowerHand(ctx context.Context, channelID, userID uuid.UUID) error {
	return s.queries.RemoveStageHandRaise(ctx, channelID, userID)
}

// InviteToSpeak creates a speaker entry with invited=true.
func (s *StageService) InviteToSpeak(ctx context.Context, channelID, targetUserID, actingUserID uuid.UUID) (*models.StageSpeaker, error) {
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrChannelNotFound
		}
		return nil, err
	}

	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, actingUserID, models.PermManageChannels)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	if _, err := s.queries.GetStageInstance(ctx, channelID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStageNotActive
		}
		return nil, err
	}

	speaker, err := s.queries.AddStageSpeaker(ctx, channelID, targetUserID, true)
	if err != nil {
		return nil, err
	}

	// Remove hand raise if any
	_ = s.queries.RemoveStageHandRaise(ctx, channelID, targetUserID)

	return &speaker, nil
}

// GetStageInfo returns the full stage state for a channel.
func (s *StageService) GetStageInfo(ctx context.Context, channelID uuid.UUID) (*models.StageInfo, error) {
	instance, err := s.queries.GetStageInstance(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &models.StageInfo{
				Instance:   nil,
				Speakers:   []models.StageSpeaker{},
				HandRaises: []models.StageHandRaise{},
			}, nil
		}
		return nil, err
	}

	speakers, err := s.queries.GetStageSpeakers(ctx, channelID)
	if err != nil {
		return nil, err
	}

	raises, err := s.queries.GetStageHandRaises(ctx, channelID)
	if err != nil {
		return nil, err
	}

	return &models.StageInfo{
		Instance:   &instance,
		Speakers:   speakers,
		HandRaises: raises,
	}, nil
}

// GetChannelServerID returns the server ID for a channel (helper for handler).
func (s *StageService) GetChannelServerID(ctx context.Context, channelID uuid.UUID) (uuid.UUID, error) {
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		return uuid.Nil, err
	}
	return channel.ServerID, nil
}
