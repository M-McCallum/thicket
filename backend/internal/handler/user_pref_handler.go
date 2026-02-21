package handler

import (
	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type UserPrefHandler struct {
	service *service.UserPrefService
}

func NewUserPrefHandler(s *service.UserPrefService) *UserPrefHandler {
	return &UserPrefHandler{service: s}
}

func (h *UserPrefHandler) GetPreferences(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	prefs, err := h.service.GetPreferences(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get preferences"})
	}
	return c.JSON(prefs)
}

func (h *UserPrefHandler) UpdatePreferences(c fiber.Ctx) error {
	var body struct {
		Theme       *string `json:"theme"`
		CompactMode *bool   `json:"compact_mode"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	prefs, err := h.service.UpdatePreferences(c.Context(), userID, body.Theme, body.CompactMode)
	if err != nil {
		if err == service.ErrInvalidTheme {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update preferences"})
	}
	return c.JSON(prefs)
}
