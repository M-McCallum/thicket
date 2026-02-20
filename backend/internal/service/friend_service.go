package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrFriendshipNotFound = errors.New("friendship not found")
	ErrAlreadyFriends     = errors.New("already friends or request pending")
	ErrCannotFriendSelf   = errors.New("cannot send friend request to yourself")
	ErrUserBlocked        = errors.New("user is blocked")
	ErrNotPending         = errors.New("friendship is not pending")
)

type FriendService struct {
	queries *models.Queries
}

func NewFriendService(q *models.Queries) *FriendService {
	return &FriendService{queries: q}
}

func (s *FriendService) SendRequest(ctx context.Context, requesterID uuid.UUID, addresseeUsername string) (*models.Friendship, error) {
	addressee, err := s.queries.GetUserByUsername(ctx, addresseeUsername)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	if requesterID == addressee.ID {
		return nil, ErrCannotFriendSelf
	}

	// Check existing friendship
	existing, err := s.queries.GetFriendshipBetween(ctx, requesterID, addressee.ID)
	if err == nil {
		if existing.Status == "blocked" {
			return nil, ErrUserBlocked
		}
		return nil, ErrAlreadyFriends
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	f, err := s.queries.CreateFriendship(ctx, requesterID, addressee.ID)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *FriendService) AcceptRequest(ctx context.Context, friendshipID, userID uuid.UUID) error {
	f, err := s.queries.GetFriendshipByID(ctx, friendshipID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrFriendshipNotFound
		}
		return err
	}
	if f.AddresseeID != userID {
		return ErrFriendshipNotFound
	}
	if f.Status != "pending" {
		return ErrNotPending
	}
	return s.queries.UpdateFriendshipStatus(ctx, friendshipID, "accepted")
}

func (s *FriendService) DeclineRequest(ctx context.Context, friendshipID, userID uuid.UUID) error {
	f, err := s.queries.GetFriendshipByID(ctx, friendshipID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrFriendshipNotFound
		}
		return err
	}
	if f.AddresseeID != userID {
		return ErrFriendshipNotFound
	}
	if f.Status != "pending" {
		return ErrNotPending
	}
	return s.queries.DeleteFriendship(ctx, friendshipID)
}

func (s *FriendService) RemoveFriend(ctx context.Context, friendshipID, userID uuid.UUID) error {
	f, err := s.queries.GetFriendshipByID(ctx, friendshipID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrFriendshipNotFound
		}
		return err
	}
	if f.RequesterID != userID && f.AddresseeID != userID {
		return ErrFriendshipNotFound
	}
	return s.queries.DeleteFriendship(ctx, friendshipID)
}

func (s *FriendService) BlockUser(ctx context.Context, blockerID, blockedID uuid.UUID) error {
	if blockerID == blockedID {
		return ErrCannotFriendSelf
	}

	existing, err := s.queries.GetFriendshipBetween(ctx, blockerID, blockedID)
	if err == nil {
		return s.queries.UpdateFriendshipStatus(ctx, existing.ID, "blocked")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	_, err = s.queries.CreateFriendship(ctx, blockerID, blockedID)
	if err != nil {
		return err
	}
	// The friendship was just created as "pending", update to "blocked"
	f, err := s.queries.GetFriendshipBetween(ctx, blockerID, blockedID)
	if err != nil {
		return err
	}
	return s.queries.UpdateFriendshipStatus(ctx, f.ID, "blocked")
}

func (s *FriendService) UnblockUser(ctx context.Context, blockerID, blockedID uuid.UUID) error {
	f, err := s.queries.GetFriendshipBetween(ctx, blockerID, blockedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrFriendshipNotFound
		}
		return err
	}
	if f.Status != "blocked" {
		return ErrFriendshipNotFound
	}
	return s.queries.DeleteFriendship(ctx, f.ID)
}

func (s *FriendService) GetFriends(ctx context.Context, userID uuid.UUID) ([]models.FriendshipWithUser, error) {
	return s.queries.GetAcceptedFriends(ctx, userID)
}

func (s *FriendService) GetPendingRequests(ctx context.Context, userID uuid.UUID) ([]models.FriendshipWithUser, error) {
	return s.queries.GetPendingFriendRequests(ctx, userID)
}
