package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrUserBanned      = errors.New("user is banned from this server")
	ErrCannotModOwner  = errors.New("cannot moderate the server owner")
	ErrBanNotFound     = errors.New("ban not found")
	ErrTimeoutNotFound = errors.New("timeout not found")
)

type ModerationService struct {
	queries *models.Queries
	permSvc *PermissionService
}

func NewModerationService(q *models.Queries, permSvc *PermissionService) *ModerationService {
	return &ModerationService{queries: q, permSvc: permSvc}
}

// BanUser bans a user from a server, removes their membership, and logs it.
func (s *ModerationService) BanUser(ctx context.Context, serverID, targetID, actorID uuid.UUID, reason string) (*models.ServerBan, error) {
	// Check permission
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermBanMembers)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	// Cannot ban server owner
	server, err := s.queries.GetServerByID(ctx, serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrServerNotFound
		}
		return nil, err
	}
	if server.OwnerID == targetID {
		return nil, ErrCannotModOwner
	}

	// Create ban
	ban, err := s.queries.CreateBan(ctx, serverID, targetID, actorID, reason)
	if err != nil {
		return nil, err
	}

	// Remove member (ignore error if not a member)
	_ = s.queries.RemoveServerMember(ctx, serverID, targetID)

	// Audit log
	targetType := "user"
	_ = s.queries.InsertAuditLog(ctx, serverID, actorID, "MEMBER_BAN", &targetID, &targetType, nil, reason)

	return &ban, nil
}

// UnbanUser removes a ban.
func (s *ModerationService) UnbanUser(ctx context.Context, serverID, targetID, actorID uuid.UUID) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermBanMembers)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	if err := s.queries.RemoveBan(ctx, serverID, targetID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrBanNotFound
		}
		return err
	}

	targetType := "user"
	_ = s.queries.InsertAuditLog(ctx, serverID, actorID, "MEMBER_UNBAN", &targetID, &targetType, nil, "")

	return nil
}

// KickUser removes a user from a server without banning.
func (s *ModerationService) KickUser(ctx context.Context, serverID, targetID, actorID uuid.UUID, reason string) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermKickMembers)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	server, err := s.queries.GetServerByID(ctx, serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrServerNotFound
		}
		return err
	}
	if server.OwnerID == targetID {
		return ErrCannotModOwner
	}

	// Verify target is a member
	if _, err := s.queries.GetServerMember(ctx, serverID, targetID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}

	if err := s.queries.RemoveServerMember(ctx, serverID, targetID); err != nil {
		return err
	}

	targetType := "user"
	_ = s.queries.InsertAuditLog(ctx, serverID, actorID, "MEMBER_KICK", &targetID, &targetType, nil, reason)

	return nil
}

// TimeoutUser applies a timeout to a user.
func (s *ModerationService) TimeoutUser(ctx context.Context, serverID, targetID, actorID uuid.UUID, reason string, duration time.Duration) (*models.ServerTimeout, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermKickMembers)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	server, err := s.queries.GetServerByID(ctx, serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrServerNotFound
		}
		return nil, err
	}
	if server.OwnerID == targetID {
		return nil, ErrCannotModOwner
	}

	// Verify target is a member
	if _, err := s.queries.GetServerMember(ctx, serverID, targetID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	expiresAt := time.Now().Add(duration)
	timeout, err := s.queries.CreateTimeout(ctx, serverID, targetID, actorID, reason, expiresAt)
	if err != nil {
		return nil, err
	}

	targetType := "user"
	changes, _ := json.Marshal(map[string]string{"duration": duration.String()})
	_ = s.queries.InsertAuditLog(ctx, serverID, actorID, "MEMBER_TIMEOUT", &targetID, &targetType, changes, reason)

	return &timeout, nil
}

// RemoveTimeout removes an active timeout.
func (s *ModerationService) RemoveTimeout(ctx context.Context, serverID, targetID, actorID uuid.UUID) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermKickMembers)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	if err := s.queries.RemoveTimeout(ctx, serverID, targetID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrTimeoutNotFound
		}
		return err
	}

	targetType := "user"
	_ = s.queries.InsertAuditLog(ctx, serverID, actorID, "MEMBER_TIMEOUT_REMOVE", &targetID, &targetType, nil, "")

	return nil
}

// GetBans returns all bans for a server. Requires BanMembers permission.
func (s *ModerationService) GetBans(ctx context.Context, serverID, actorID uuid.UUID) ([]models.ServerBan, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermBanMembers)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	return s.queries.GetServerBans(ctx, serverID)
}

// GetTimeouts returns active timeouts. Requires KickMembers permission.
func (s *ModerationService) GetTimeouts(ctx context.Context, serverID, actorID uuid.UUID) ([]models.ServerTimeout, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermKickMembers)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	return s.queries.GetServerTimeouts(ctx, serverID)
}

// GetAuditLog returns the audit log. Requires ManageServer permission.
func (s *ModerationService) GetAuditLog(ctx context.Context, serverID, actorID uuid.UUID, limit int32, before *time.Time) ([]models.AuditLogEntry, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermManageServer)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	return s.queries.GetAuditLog(ctx, serverID, limit, before)
}

// IsUserBanned checks if user is banned from a server.
func (s *ModerationService) IsUserBanned(ctx context.Context, serverID, userID uuid.UUID) (bool, error) {
	return s.queries.IsUserBanned(ctx, serverID, userID)
}

// IsUserTimedOut checks if user has an active timeout.
func (s *ModerationService) IsUserTimedOut(ctx context.Context, serverID, userID uuid.UUID) (bool, error) {
	return s.queries.IsUserTimedOut(ctx, serverID, userID)
}
