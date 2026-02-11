package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/ory"
)

// IdentityService syncs Kratos identities to local users.
type IdentityService struct {
	queries      *models.Queries
	kratosClient *ory.KratosClient
}

// NewIdentityService creates an IdentityService.
func NewIdentityService(queries *models.Queries, kratosClient *ory.KratosClient) *IdentityService {
	return &IdentityService{
		queries:      queries,
		kratosClient: kratosClient,
	}
}

// FindOrCreateUser looks up a local user by Kratos ID, creating one from Kratos
// traits if no local user exists yet.
func (s *IdentityService) FindOrCreateUser(ctx context.Context, kratosID string) (*models.User, error) {
	kratosUUID, err := uuid.Parse(kratosID)
	if err != nil {
		return nil, fmt.Errorf("invalid kratos ID %q: %w", kratosID, err)
	}

	user, err := s.queries.GetUserByKratosID(ctx, kratosUUID)
	if err == nil {
		return &user, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("lookup user by kratos ID: %w", err)
	}

	identity, err := s.kratosClient.GetIdentity(ctx, kratosID)
	if err != nil {
		return nil, fmt.Errorf("fetch kratos identity: %w", err)
	}

	user, err = s.queries.CreateUserFromKratos(ctx, models.CreateUserFromKratosParams{
		Username: identity.Traits.Username,
		Email:    identity.Traits.Email,
		KratosID: kratosUUID,
	})
	if err != nil {
		return nil, fmt.Errorf("create user from kratos: %w", err)
	}

	return &user, nil
}

// SyncTraits fetches the latest identity traits from Kratos and updates the
// local user's username and email if they have changed.
func (s *IdentityService) SyncTraits(ctx context.Context, kratosID string) error {
	kratosUUID, err := uuid.Parse(kratosID)
	if err != nil {
		return fmt.Errorf("invalid kratos ID %q: %w", kratosID, err)
	}

	identity, err := s.kratosClient.GetIdentity(ctx, kratosID)
	if err != nil {
		return fmt.Errorf("fetch kratos identity: %w", err)
	}

	user, err := s.queries.GetUserByKratosID(ctx, kratosUUID)
	if err != nil {
		return fmt.Errorf("lookup user by kratos ID: %w", err)
	}

	if user.Username == identity.Traits.Username && user.Email == identity.Traits.Email {
		return nil
	}

	displayName := identity.Traits.DisplayName
	var displayNamePtr *string
	if displayName != "" {
		displayNamePtr = &displayName
	}

	_, err = s.queries.UpdateUserProfile(ctx, models.UpdateUserProfileParams{
		ID:          user.ID,
		DisplayName: displayNamePtr,
	})
	if err != nil {
		return fmt.Errorf("update user profile: %w", err)
	}

	return nil
}
