package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrOnboardingPromptNotFound = errors.New("onboarding prompt not found")
	ErrOnboardingOptionNotFound = errors.New("onboarding option not found")
)

type OnboardingService struct {
	queries *models.Queries
	permSvc *PermissionService
}

func NewOnboardingService(q *models.Queries, permSvc *PermissionService) *OnboardingService {
	return &OnboardingService{queries: q, permSvc: permSvc}
}

// GetWelcomeConfig returns the welcome config for a server.
func (s *OnboardingService) GetWelcomeConfig(ctx context.Context, serverID, userID uuid.UUID) (*models.WelcomeConfig, error) {
	// Verify membership
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
	return &models.WelcomeConfig{
		WelcomeMessage:  server.WelcomeMessage,
		WelcomeChannels: server.WelcomeChannels,
	}, nil
}

// UpdateWelcomeConfig updates the welcome config. Requires ManageServer permission.
func (s *OnboardingService) UpdateWelcomeConfig(ctx context.Context, serverID, userID uuid.UUID, message string, channelIDs []uuid.UUID) (*models.WelcomeConfig, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageServer)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}
	server, err := s.queries.UpdateWelcomeConfig(ctx, serverID, message, channelIDs)
	if err != nil {
		return nil, err
	}
	return &models.WelcomeConfig{
		WelcomeMessage:  server.WelcomeMessage,
		WelcomeChannels: server.WelcomeChannels,
	}, nil
}

// GetOnboarding returns all prompts + options for a server.
func (s *OnboardingService) GetOnboarding(ctx context.Context, serverID, userID uuid.UUID) ([]models.OnboardingPrompt, error) {
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	prompts, err := s.queries.GetOnboardingPrompts(ctx, serverID)
	if err != nil {
		return nil, err
	}

	// Load options for each prompt
	allOptions, err := s.queries.GetAllOnboardingOptions(ctx, serverID)
	if err != nil {
		return nil, err
	}

	// Group options by prompt ID
	optMap := make(map[uuid.UUID][]models.OnboardingOption)
	for _, o := range allOptions {
		optMap[o.PromptID] = append(optMap[o.PromptID], o)
	}
	for i := range prompts {
		if opts, ok := optMap[prompts[i].ID]; ok {
			prompts[i].Options = opts
		}
	}

	return prompts, nil
}

// UpdateOnboarding replaces all prompts + options for a server. Requires ManageServer.
func (s *OnboardingService) UpdateOnboarding(ctx context.Context, serverID, userID uuid.UUID, prompts []models.OnboardingPrompt) ([]models.OnboardingPrompt, error) {
	ok, err := s.permSvc.HasServerPermission(ctx, serverID, userID, models.PermManageServer)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	// Delete all existing prompts (cascades to options)
	if err := s.queries.DeleteAllOnboardingPrompts(ctx, serverID); err != nil {
		return nil, err
	}

	// Re-create prompts and options
	result := make([]models.OnboardingPrompt, 0, len(prompts))
	for i, p := range prompts {
		created, err := s.queries.CreateOnboardingPrompt(ctx, serverID, p.Title, p.Description, p.Required, i)
		if err != nil {
			return nil, err
		}
		for j, o := range p.Options {
			opt, err := s.queries.CreateOnboardingOption(ctx, created.ID, o.Label, o.Description, o.Emoji, o.RoleIDs, o.ChannelIDs, j)
			if err != nil {
				return nil, err
			}
			created.Options = append(created.Options, opt)
		}
		result = append(result, created)
	}

	return result, nil
}

// CompleteOnboarding marks onboarding as complete and assigns roles based on selections.
func (s *OnboardingService) CompleteOnboarding(ctx context.Context, serverID, userID uuid.UUID, selectedOptionIDs []uuid.UUID) error {
	// Verify membership
	if _, err := s.queries.GetServerMember(ctx, serverID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}

	// Get all options for this server to validate selections and collect role assignments
	allOptions, err := s.queries.GetAllOnboardingOptions(ctx, serverID)
	if err != nil {
		return err
	}

	optionMap := make(map[uuid.UUID]models.OnboardingOption)
	for _, o := range allOptions {
		optionMap[o.ID] = o
	}

	// Collect all role IDs to assign
	roleSet := make(map[uuid.UUID]bool)
	for _, optID := range selectedOptionIDs {
		if opt, ok := optionMap[optID]; ok {
			for _, roleID := range opt.RoleIDs {
				roleSet[roleID] = true
			}
		}
	}

	// Assign roles
	for roleID := range roleSet {
		// Best-effort: skip errors for individual role assignments (role might not exist anymore)
		_ = s.queries.AssignRole(ctx, serverID, userID, roleID)
	}

	// Mark completed
	return s.queries.MarkOnboardingCompleted(ctx, serverID, userID)
}

// IsOnboardingCompleted checks if the user has completed onboarding for this server.
func (s *OnboardingService) IsOnboardingCompleted(ctx context.Context, serverID, userID uuid.UUID) (bool, error) {
	return s.queries.IsOnboardingCompleted(ctx, userID, serverID)
}
