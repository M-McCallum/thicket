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
	ErrInviteNotFound          = errors.New("invite not found")
	ErrInviteExpired           = errors.New("invite has expired")
	ErrInviteMaxUsed           = errors.New("invite has reached maximum uses")
	ErrInvitationNotFound      = errors.New("invitation not found")
	ErrInvitationAlreadySent   = errors.New("invitation already sent to this user")
	ErrCannotInviteSelf        = errors.New("cannot invite yourself")
	ErrRecipientAlreadyMember  = errors.New("user is already a server member")
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

	// Check PermCreateInvite
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermCreateInvite)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
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

// SendInviteByUsername sends a server invitation to a user by their username.
// Returns the invitation and recipient user ID (for WS + DM).
func (s *InviteService) SendInviteByUsername(ctx context.Context, serverID, senderID uuid.UUID, recipientUsername string) (*models.ServerInvitationWithDetails, uuid.UUID, error) {
	// Check sender membership
	if _, err := s.queries.GetServerMember(ctx, serverID, senderID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, uuid.Nil, ErrNotMember
		}
		return nil, uuid.Nil, err
	}

	// Check PermCreateInvite
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, senderID, models.PermCreateInvite)
	if err != nil {
		return nil, uuid.Nil, err
	}
	if !ok {
		return nil, uuid.Nil, ErrInsufficientRole
	}

	// Look up recipient
	recipient, err := s.queries.GetUserByUsername(ctx, recipientUsername)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, uuid.Nil, ErrUserNotFound
		}
		return nil, uuid.Nil, err
	}

	if recipient.ID == senderID {
		return nil, uuid.Nil, ErrCannotInviteSelf
	}

	// Check recipient not already a member
	if _, err := s.queries.GetServerMember(ctx, serverID, recipient.ID); err == nil {
		return nil, uuid.Nil, ErrRecipientAlreadyMember
	}

	// Check no existing pending invitation
	if _, err := s.queries.FindPendingServerInvitation(ctx, serverID, senderID, recipient.ID); err == nil {
		return nil, uuid.Nil, ErrInvitationAlreadySent
	}

	// Create invitation
	inv, err := s.queries.CreateServerInvitation(ctx, serverID, senderID, recipient.ID)
	if err != nil {
		return nil, uuid.Nil, err
	}

	// Get server and sender details for the response
	server, err := s.queries.GetServerByID(ctx, serverID)
	if err != nil {
		return nil, uuid.Nil, err
	}
	sender, err := s.queries.GetUserByID(ctx, senderID)
	if err != nil {
		return nil, uuid.Nil, err
	}

	details := &models.ServerInvitationWithDetails{
		ServerInvitation: inv,
		ServerName:       server.Name,
		ServerIconURL:    server.IconURL,
		SenderUsername:   sender.Username,
		RecipientUsername: recipient.Username,
	}

	return details, recipient.ID, nil
}

// AcceptInvitation accepts a pending server invitation.
func (s *InviteService) AcceptInvitation(ctx context.Context, invitationID, recipientID uuid.UUID) (*models.Server, *models.ServerInvitation, error) {
	inv, err := s.queries.GetServerInvitationByID(ctx, invitationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrInvitationNotFound
		}
		return nil, nil, err
	}

	if inv.RecipientID != recipientID {
		return nil, nil, ErrInvitationNotFound
	}
	if inv.Status != "pending" {
		return nil, nil, ErrInvitationNotFound
	}

	// Check not already a member
	if _, err := s.queries.GetServerMember(ctx, inv.ServerID, recipientID); err == nil {
		return nil, nil, ErrAlreadyMember
	}

	// Update status
	if err := s.queries.UpdateServerInvitationStatus(ctx, invitationID, "accepted"); err != nil {
		return nil, nil, err
	}

	// Add server member
	if err := s.queries.AddServerMember(ctx, models.AddServerMemberParams{
		ServerID: inv.ServerID,
		UserID:   recipientID,
		Role:     "member",
	}); err != nil {
		return nil, nil, err
	}

	server, err := s.queries.GetServerByID(ctx, inv.ServerID)
	if err != nil {
		return nil, nil, err
	}

	return &server, &inv, nil
}

// DeclineInvitation declines a pending server invitation.
func (s *InviteService) DeclineInvitation(ctx context.Context, invitationID, recipientID uuid.UUID) (*models.ServerInvitation, error) {
	inv, err := s.queries.GetServerInvitationByID(ctx, invitationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvitationNotFound
		}
		return nil, err
	}

	if inv.RecipientID != recipientID {
		return nil, ErrInvitationNotFound
	}
	if inv.Status != "pending" {
		return nil, ErrInvitationNotFound
	}

	if err := s.queries.UpdateServerInvitationStatus(ctx, invitationID, "declined"); err != nil {
		return nil, err
	}

	return &inv, nil
}

// GetReceivedInvitations returns pending invitations for a user.
func (s *InviteService) GetReceivedInvitations(ctx context.Context, userID uuid.UUID) ([]models.ServerInvitationWithDetails, error) {
	return s.queries.GetPendingInvitationsForUser(ctx, userID)
}

// GetSentInvitations returns sent invitations for a server by a user.
func (s *InviteService) GetSentInvitations(ctx context.Context, userID, serverID uuid.UUID) ([]models.ServerInvitationWithDetails, error) {
	return s.queries.GetSentInvitationsForServer(ctx, userID, serverID)
}

func generateInviteCode8() (string, error) {
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
