package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrServerNotFound   = errors.New("server not found")
	ErrNotMember        = errors.New("not a member of this server")
	ErrAlreadyMember    = errors.New("already a member of this server")
	ErrInsufficientRole = errors.New("insufficient role")
	ErrOwnerCannotLeave = errors.New("owner cannot leave server")
	ErrInvalidServerName = errors.New("server name must be 1-100 characters")
)

type ServerService struct {
	queries *models.Queries
	permSvc *PermissionService
}

func NewServerService(q *models.Queries, permSvc *PermissionService) *ServerService {
	return &ServerService{queries: q, permSvc: permSvc}
}

func (s *ServerService) CreateServer(ctx context.Context, name string, ownerID uuid.UUID) (*models.Server, *models.Channel, error) {
	if len(name) < 1 || len(name) > 100 {
		return nil, nil, ErrInvalidServerName
	}

	inviteCode, err := generateInviteCode()
	if err != nil {
		return nil, nil, err
	}

	server, err := s.queries.CreateServer(ctx, models.CreateServerParams{
		Name:       name,
		OwnerID:    ownerID,
		InviteCode: inviteCode,
	})
	if err != nil {
		return nil, nil, err
	}

	err = s.queries.AddServerMember(ctx, models.AddServerMemberParams{
		ServerID: server.ID,
		UserID:   ownerID,
		Role:     "owner",
	})
	if err != nil {
		return nil, nil, err
	}

	// Create default @everyone role
	if err := s.queries.CreateDefaultRoles(ctx, server.ID); err != nil {
		return nil, nil, err
	}

	channel, err := s.queries.CreateChannel(ctx, models.CreateChannelParams{
		ServerID: server.ID,
		Name:     "general",
		Type:     "text",
		Position: 0,
	})
	if err != nil {
		return nil, nil, err
	}

	return &server, &channel, nil
}

func (s *ServerService) GetServer(ctx context.Context, serverID, userID uuid.UUID) (*models.Server, error) {
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	server, err := s.queries.GetServerByID(ctx, serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrServerNotFound
		}
		return nil, err
	}

	return &server, nil
}

func (s *ServerService) JoinServer(ctx context.Context, inviteCode string, userID uuid.UUID) (*models.Server, error) {
	server, err := s.queries.GetServerByInviteCode(ctx, inviteCode)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrServerNotFound
		}
		return nil, err
	}

	if _, err := s.queries.GetServerMember(ctx, server.ID, userID); err == nil {
		return nil, ErrAlreadyMember
	}

	err = s.queries.AddServerMember(ctx, models.AddServerMemberParams{
		ServerID: server.ID,
		UserID:   userID,
		Role:     "member",
	})
	if err != nil {
		return nil, err
	}

	return &server, nil
}

func (s *ServerService) LeaveServer(ctx context.Context, serverID, userID uuid.UUID) error {
	server, err := s.queries.GetServerByID(ctx, serverID)
	if err != nil {
		return ErrServerNotFound
	}

	if server.OwnerID == userID {
		return ErrOwnerCannotLeave
	}

	return s.queries.RemoveServerMember(ctx, serverID, userID)
}

func (s *ServerService) DeleteServer(ctx context.Context, serverID, userID uuid.UUID) error {
	server, err := s.queries.GetServerByID(ctx, serverID)
	if err != nil {
		return ErrServerNotFound
	}

	if server.OwnerID != userID {
		return ErrInsufficientRole
	}

	return s.queries.DeleteServer(ctx, serverID)
}

func (s *ServerService) GetUserServers(ctx context.Context, userID uuid.UUID) ([]models.Server, error) {
	return s.queries.GetUserServers(ctx, userID)
}

func (s *ServerService) GetMembers(ctx context.Context, serverID, userID uuid.UUID) ([]models.ServerMemberWithUser, error) {
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	return s.queries.GetServerMembers(ctx, serverID)
}

func (s *ServerService) GetServerMemberUserIDs(ctx context.Context, serverID uuid.UUID) ([]uuid.UUID, error) {
	return s.queries.GetServerMemberUserIDs(ctx, serverID)
}

func (s *ServerService) GetUserCoMemberIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	return s.queries.GetUserCoMemberIDs(ctx, userID)
}

type ServerPreview struct {
	Name        string  `json:"name"`
	MemberCount int64   `json:"member_count"`
	IconURL     *string `json:"icon_url"`
	Description string  `json:"description"`
}

func (s *ServerService) GetServerPreview(ctx context.Context, inviteCode string) (*ServerPreview, error) {
	server, err := s.queries.GetServerByInviteCode(ctx, inviteCode)
	if err != nil {
		return nil, ErrServerNotFound
	}
	count, _ := s.queries.GetServerMemberCount(ctx, server.ID)
	return &ServerPreview{
		Name:        server.Name,
		MemberCount: count,
		IconURL:     server.IconURL,
		Description: server.Description,
	}, nil
}

var (
	ErrInvalidNickname    = errors.New("nickname must be 0-32 characters")
	ErrCategoryNotFound   = errors.New("category not found")
	ErrInvalidCategoryName = errors.New("category name must be 1-100 characters")
)

func (s *ServerService) UpdateServer(ctx context.Context, serverID, userID uuid.UUID, name *string, iconURL *string, isPublic *bool, description *string) (*models.Server, error) {
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageServer)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}
	if name != nil && (len(*name) < 1 || len(*name) > 100) {
		return nil, ErrInvalidServerName
	}
	server, err := s.queries.UpdateServer(ctx, models.UpdateServerParams{
		ID:          serverID,
		Name:        name,
		IconURL:     iconURL,
		IsPublic:    isPublic,
		Description: description,
	})
	if err != nil {
		return nil, err
	}
	return &server, nil
}

func (s *ServerService) SetNickname(ctx context.Context, serverID, userID uuid.UUID, nickname *string) error {
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}
	if nickname != nil && len(*nickname) > 32 {
		return ErrInvalidNickname
	}
	return s.queries.UpdateMemberNickname(ctx, serverID, userID, nickname)
}

func (s *ServerService) UpdateChannel(ctx context.Context, serverID, channelID, userID uuid.UUID, name *string, topic *string, categoryID *uuid.UUID) (*models.Channel, error) {
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
	if name != nil && (len(*name) < 1 || len(*name) > 100) {
		return nil, ErrInvalidChannelName
	}
	ch, err := s.queries.UpdateChannel(ctx, models.UpdateChannelParams{
		ID:         channelID,
		Name:       name,
		Topic:      topic,
		CategoryID: categoryID,
	})
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

func (s *ServerService) CreateCategory(ctx context.Context, serverID, userID uuid.UUID, name string, position int32) (*models.ChannelCategory, error) {
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
	if len(name) < 1 || len(name) > 100 {
		return nil, ErrInvalidCategoryName
	}
	cat, err := s.queries.CreateCategory(ctx, models.CreateCategoryParams{
		ServerID: serverID,
		Name:     name,
		Position: position,
	})
	if err != nil {
		return nil, err
	}
	return &cat, nil
}

func (s *ServerService) GetCategories(ctx context.Context, serverID, userID uuid.UUID) ([]models.ChannelCategory, error) {
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}
	return s.queries.GetServerCategories(ctx, serverID)
}

func (s *ServerService) UpdateCategory(ctx context.Context, serverID, categoryID, userID uuid.UUID, name *string, position *int32) (*models.ChannelCategory, error) {
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
	if name != nil && (len(*name) < 1 || len(*name) > 100) {
		return nil, ErrInvalidCategoryName
	}
	cat, err := s.queries.UpdateCategory(ctx, categoryID, name, position)
	if err != nil {
		return nil, err
	}
	return &cat, nil
}

func (s *ServerService) DeleteCategory(ctx context.Context, serverID, categoryID, userID uuid.UUID) error {
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageChannels)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}
	return s.queries.DeleteCategory(ctx, categoryID)
}

func generateInviteCode() (string, error) {
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
