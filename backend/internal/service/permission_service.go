package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

type PermissionService struct {
	queries *models.Queries
}

func NewPermissionService(q *models.Queries) *PermissionService {
	return &PermissionService{queries: q}
}

// ComputePermissions computes the effective server-level permissions for a user.
// Owner always gets all permissions. Otherwise: @everyone perms OR'd with all member roles.
func (s *PermissionService) ComputePermissions(ctx context.Context, serverID, userID uuid.UUID) (int64, error) {
	// Check if user is server owner — bypass all
	server, err := s.queries.GetServerByID(ctx, serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrServerNotFound
		}
		return 0, err
	}
	if server.OwnerID == userID {
		return models.PermAdministrator | 0x7FFFFFFFFFFFFFFF, nil
	}

	// Get @everyone role
	everyoneRole, err := s.queries.GetEveryoneRole(ctx, serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}

	perms := everyoneRole.Permissions

	// Get member-specific roles and OR them in
	memberRoles, err := s.queries.GetMemberRoles(ctx, serverID, userID)
	if err != nil {
		return perms, nil
	}

	for _, role := range memberRoles {
		perms |= role.Permissions
	}

	return perms, nil
}

// ComputeChannelPermissions computes effective permissions for a channel,
// applying channel-level overrides on top of server-level permissions.
func (s *PermissionService) ComputeChannelPermissions(ctx context.Context, channelID, userID uuid.UUID) (int64, error) {
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrChannelNotFound
		}
		return 0, err
	}

	perms, err := s.ComputePermissions(ctx, channel.ServerID, userID)
	if err != nil {
		return 0, err
	}

	// Administrator bypasses channel overrides
	if models.HasPermission(perms, models.PermAdministrator) {
		return perms, nil
	}

	// Apply channel overrides
	overrides, err := s.queries.GetChannelOverrides(ctx, channelID)
	if err != nil {
		return perms, nil
	}

	// Get member's role IDs for matching
	memberRoles, _ := s.queries.GetMemberRoles(ctx, channel.ServerID, userID)
	memberRoleIDs := make(map[uuid.UUID]bool)
	for _, r := range memberRoles {
		memberRoleIDs[r.ID] = true
	}

	// Also include @everyone role
	everyoneRole, err := s.queries.GetEveryoneRole(ctx, channel.ServerID)
	if err == nil {
		memberRoleIDs[everyoneRole.ID] = true
	}

	// Apply overrides: deny clears bits, allow sets bits
	for _, o := range overrides {
		if memberRoleIDs[o.RoleID] {
			perms &= ^o.Deny
			perms |= o.Allow
		}
	}

	return perms, nil
}

// HasServerPermission checks if a user has a specific permission in a server.
func (s *PermissionService) HasServerPermission(ctx context.Context, serverID, userID uuid.UUID, perm int64) (bool, error) {
	perms, err := s.ComputePermissions(ctx, serverID, userID)
	if err != nil {
		return false, err
	}
	return models.HasPermission(perms, perm), nil
}

// HasChannelPermission checks if a user has a specific permission in a channel.
func (s *PermissionService) HasChannelPermission(ctx context.Context, channelID, userID uuid.UUID, perm int64) (bool, error) {
	perms, err := s.ComputeChannelPermissions(ctx, channelID, userID)
	if err != nil {
		return false, err
	}
	return models.HasPermission(perms, perm), nil
}
