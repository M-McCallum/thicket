package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
)

type OnboardingHandler struct {
	onboardingSvc *service.OnboardingService
}

func NewOnboardingHandler(os *service.OnboardingService) *OnboardingHandler {
	return &OnboardingHandler{onboardingSvc: os}
}

// GetWelcome returns the welcome config for a server.
func (h *OnboardingHandler) GetWelcome(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}
	userID := auth.GetUserID(c)

	config, err := h.onboardingSvc.GetWelcomeConfig(c.Context(), serverID, userID)
	if err != nil {
		return handleOnboardingError(c, err)
	}
	return c.JSON(config)
}

// UpdateWelcome updates the welcome config.
func (h *OnboardingHandler) UpdateWelcome(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}
	userID := auth.GetUserID(c)

	var body struct {
		WelcomeMessage  string      `json:"welcome_message"`
		WelcomeChannels []uuid.UUID `json:"welcome_channels"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	config, err := h.onboardingSvc.UpdateWelcomeConfig(c.Context(), serverID, userID, body.WelcomeMessage, body.WelcomeChannels)
	if err != nil {
		return handleOnboardingError(c, err)
	}
	return c.JSON(config)
}

// GetOnboarding returns all onboarding prompts + options for a server.
func (h *OnboardingHandler) GetOnboarding(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}
	userID := auth.GetUserID(c)

	prompts, err := h.onboardingSvc.GetOnboarding(c.Context(), serverID, userID)
	if err != nil {
		return handleOnboardingError(c, err)
	}
	return c.JSON(prompts)
}

// UpdateOnboarding replaces all onboarding prompts + options.
func (h *OnboardingHandler) UpdateOnboarding(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}
	userID := auth.GetUserID(c)

	var body struct {
		Prompts []models.OnboardingPrompt `json:"prompts"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	prompts, err := h.onboardingSvc.UpdateOnboarding(c.Context(), serverID, userID, body.Prompts)
	if err != nil {
		return handleOnboardingError(c, err)
	}
	return c.JSON(prompts)
}

// CompleteOnboarding submits selections and marks onboarding as completed.
func (h *OnboardingHandler) CompleteOnboarding(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}
	userID := auth.GetUserID(c)

	var body struct {
		SelectedOptionIDs []uuid.UUID `json:"selected_option_ids"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if err := h.onboardingSvc.CompleteOnboarding(c.Context(), serverID, userID, body.SelectedOptionIDs); err != nil {
		return handleOnboardingError(c, err)
	}
	return c.JSON(fiber.Map{"message": "onboarding completed"})
}

// GetOnboardingStatus checks if the current user has completed onboarding.
func (h *OnboardingHandler) GetOnboardingStatus(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}
	userID := auth.GetUserID(c)

	completed, err := h.onboardingSvc.IsOnboardingCompleted(c.Context(), serverID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to check onboarding status"})
	}
	return c.JSON(fiber.Map{"completed": completed})
}

func handleOnboardingError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrServerNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrOnboardingPromptNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
