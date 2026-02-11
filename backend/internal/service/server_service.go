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
}

func NewServerService(q *models.Queries) *ServerService {
	return &ServerService{queries: q}
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

func generateInviteCode() (string, error) {
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
