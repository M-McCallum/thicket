package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type NotificationPrefHandler struct {
	notifPrefService *service.NotificationPrefService
}

func NewNotificationPrefHandler(nps *service.NotificationPrefService) *NotificationPrefHandler {
	return &NotificationPrefHandler{notifPrefService: nps}
}

func (h *NotificationPrefHandler) GetPrefs(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	prefs, err := h.notifPrefService.GetPrefs(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get preferences"})
	}
	return c.JSON(prefs)
}

func (h *NotificationPrefHandler) SetPref(c fiber.Ctx) error {
	scopeType := c.Params("scopeType")
	scopeID, err := uuid.Parse(c.Params("scopeId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid scope ID"})
	}

	var body struct {
		Setting string `json:"setting"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	if err := h.notifPrefService.SetPref(c.Context(), userID, scopeType, scopeID, body.Setting); err != nil {
		if err == service.ErrInvalidSetting || err == service.ErrInvalidScopeType {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to set preference"})
	}

	return c.JSON(fiber.Map{"message": "preference updated"})
}
