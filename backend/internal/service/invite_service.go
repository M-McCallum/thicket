package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrInviteNotFound = errors.New("invite not found")
	ErrInviteExpired  = errors.New("invite has expired")
	ErrInviteMaxUsed  = errors.New("invite has reached maximum uses")
)

type InviteService struct {
	queries *models.Queries
	permSvc *PermissionService
}

func NewInviteService(q *models.Queries, permSvc *PermissionService) *InviteService {
	return &InviteService{queries: q, permSvc: permSvc}
}

func (s *InviteService) CreateInvite(ctx context.Context, serverID, userID uuid.UUID, maxUses *int, expiresAt *time.Time) (*models.ServerInvite, error) {
	// Validate membership
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	code, err := generateInviteCode8()
	if err != nil {
		return nil, err
	}

	invite, err := s.queries.CreateServerInvite(ctx, serverID, userID, code, maxUses, expiresAt)
	if err != nil {
		return nil, err
	}
	return &invite, nil
}

func (s *InviteService) UseInvite(ctx context.Context, code string, userID uuid.UUID) (*models.Server, error) {
	invite, err := s.queries.GetServerInviteByCode(ctx, code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInviteNotFound
		}
		return nil, err
	}

	// Check expiration
	if invite.ExpiresAt != nil && invite.ExpiresAt.Before(time.Now()) {
		return nil, ErrInviteExpired
	}

	// Check max uses
	if invite.MaxUses != nil && invite.Uses >= *invite.MaxUses {
		return nil, ErrInviteMaxUsed
	}

	// Check not already member
	if _, err := s.queries.GetServerMember(ctx, invite.ServerID, userID); err == nil {
		return nil, ErrAlreadyMember
	}

	// Increment uses
	if err := s.queries.IncrementInviteUses(ctx, invite.ID); err != nil {
		return nil, err
	}

	// Add member
	if err := s.queries.AddServerMember(ctx, models.AddServerMemberParams{
		ServerID: invite.ServerID,
		UserID:   userID,
		Role:     "member",
	}); err != nil {
		return nil, err
	}

	server, err := s.queries.GetServerByID(ctx, invite.ServerID)
	if err != nil {
		return nil, err
	}
	return &server, nil
}

func (s *InviteService) ListInvites(ctx context.Context, serverID, userID uuid.UUID) ([]models.ServerInvite, error) {
	// Validate membership
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	return s.queries.GetServerInvites(ctx, serverID)
}

func (s *InviteService) DeleteInvite(ctx context.Context, inviteID, userID uuid.UUID) error {
	invite, err := s.queries.GetServerInviteByID(ctx, inviteID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInviteNotFound
		}
		return err
	}

	// Allow creator or admin
	if invite.CreatorID != userID {
		ok, err := s.permSvc.HasServerPermission(ctx, invite.ServerID, userID, models.PermManageServer)
		if err != nil {
			return err
		}
		if !ok {
			return ErrInsufficientRole
		}
	}

	return s.queries.DeleteServerInvite(ctx, inviteID)
}

func (s *InviteService) GetPublicServers(ctx context.Context, query string, limit, offset int) ([]models.PublicServerResult, error) {
	if limit <= 0 || limit > 50 {
		limit = 25
	}
	if offset < 0 {
		offset = 0
	}
	return s.queries.GetPublicServers(ctx, query, limit, offset)
}

func generateInviteCode8() (string, error) {
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
