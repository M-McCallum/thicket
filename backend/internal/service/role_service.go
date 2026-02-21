package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrRoleNotFound      = errors.New("role not found")
	ErrCannotDeleteEveryone = errors.New("cannot delete @everyone role")
	ErrCannotModifyHigherRole = errors.New("cannot modify a role above yours")
	ErrInvalidRoleName   = errors.New("role name must be 1-100 characters")
)

type RoleService struct {
	queries *models.Queries
	permSvc *PermissionService
}

func NewRoleService(q *models.Queries, permSvc *PermissionService) *RoleService {
	return &RoleService{queries: q, permSvc: permSvc}
}

func (s *RoleService) GetRoles(ctx context.Context, serverID uuid.UUID) ([]models.Role, error) {
	return s.queries.GetServerRoles(ctx, serverID)
}

func (s *RoleService) CreateRole(ctx context.Context, serverID, userID uuid.UUID, name string, color *string, permissions int64, hoist bool) (*models.Role, error) {
	if len(name) < 1 || len(name) > 100 {
		return nil, ErrInvalidRoleName
	}

	// Check the user has MANAGE_ROLES permission
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageRoles)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	// Get next position
	maxPos, err := s.queries.GetMaxRolePosition(ctx, serverID)
	if err != nil {
		return nil, err
	}

	role, err := s.queries.CreateRole(ctx, models.CreateRoleParams{
		ServerID:    serverID,
		Name:        name,
		Color:       color,
		Position:    maxPos + 1,
		Permissions: permissions,
		Hoist:       hoist,
	})
	if err != nil {
		return nil, err
	}

	return &role, nil
}

func (s *RoleService) UpdateRole(ctx context.Context, serverID, roleID, userID uuid.UUID, name *string, color *string, permissions *int64, hoist *bool) (*models.Role, error) {
	if name != nil && (len(*name) < 1 || len(*name) > 100) {
		return nil, ErrInvalidRoleName
	}

	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageRoles)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	// Verify role exists and belongs to this server
	role, err := s.queries.GetRoleByID(ctx, roleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrRoleNotFound
		}
		return nil, err
	}
	if role.ServerID != serverID {
		return nil, ErrRoleNotFound
	}

	updated, err := s.queries.UpdateRole(ctx, models.UpdateRoleParams{
		ID:          roleID,
		Name:        name,
		Color:       color,
		Permissions: permissions,
		Hoist:       hoist,
	})
	if err != nil {
		return nil, err
	}

	return &updated, nil
}

func (s *RoleService) DeleteRole(ctx context.Context, serverID, roleID, userID uuid.UUID) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageRoles)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	role, err := s.queries.GetRoleByID(ctx, roleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRoleNotFound
		}
		return err
	}
	if role.ServerID != serverID {
		return ErrRoleNotFound
	}

	// Cannot delete @everyone
	if role.Position == 0 && role.Name == "@everyone" {
		return ErrCannotDeleteEveryone
	}

	return s.queries.DeleteRole(ctx, roleID)
}

func (s *RoleService) ReorderRoles(ctx context.Context, serverID, userID uuid.UUID, positions []models.RolePosition) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageRoles)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	return s.queries.ReorderRoles(ctx, serverID, positions)
}

func (s *RoleService) AssignRole(ctx context.Context, serverID, targetUserID, roleID, actorID uuid.UUID) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermManageRoles)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	// Verify the role belongs to this server
	role, err := s.queries.GetRoleByID(ctx, roleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRoleNotFound
		}
		return err
	}
	if role.ServerID != serverID {
		return ErrRoleNotFound
	}

	// Verify the target user is a member
	if _, err := s.queries.GetServerMember(ctx, serverID, targetUserID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}

	return s.queries.AssignRole(ctx, serverID, targetUserID, roleID)
}

func (s *RoleService) RemoveRole(ctx context.Context, serverID, targetUserID, roleID, actorID uuid.UUID) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, actorID, models.PermManageRoles)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	role, err := s.queries.GetRoleByID(ctx, roleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRoleNotFound
		}
		return err
	}
	if role.ServerID != serverID {
		return ErrRoleNotFound
	}

	return s.queries.RemoveRole(ctx, serverID, targetUserID, roleID)
}

func (s *RoleService) GetChannelOverrides(ctx context.Context, channelID uuid.UUID) ([]models.ChannelPermissionOverride, error) {
	return s.queries.GetChannelOverrides(ctx, channelID)
}

func (s *RoleService) SetChannelOverride(ctx context.Context, serverID, channelID, roleID, userID uuid.UUID, allow, deny int64) (*models.ChannelPermissionOverride, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageRoles)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	override, err := s.queries.SetChannelOverride(ctx, channelID, roleID, allow, deny)
	if err != nil {
		return nil, err
	}
	return &override, nil
}

func (s *RoleService) DeleteChannelOverride(ctx context.Context, serverID, channelID, roleID, userID uuid.UUID) error {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageRoles)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	return s.queries.DeleteChannelOverride(ctx, channelID, roleID)
}

// GetMembersWithRoles returns members with their roles attached.
func (s *RoleService) GetMembersWithRoles(ctx context.Context, serverID uuid.UUID) ([]models.MemberWithRoles, error) {
	return s.queries.GetMembersWithRoles(ctx, serverID)
}
