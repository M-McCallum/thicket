package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type ReadStateHandler struct {
	readStateService *service.ReadStateService
}

func NewReadStateHandler(rs *service.ReadStateService) *ReadStateHandler {
	return &ReadStateHandler{readStateService: rs}
}

func (h *ReadStateHandler) AckChannel(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}
	userID := auth.GetUserID(c)
	if err := h.readStateService.AckChannel(c.Context(), userID, channelID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to acknowledge"})
	}
	return c.JSON(fiber.Map{"message": "acknowledged"})
}

func (h *ReadStateHandler) AckDM(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}
	userID := auth.GetUserID(c)
	if err := h.readStateService.AckDM(c.Context(), userID, conversationID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to acknowledge"})
	}
	return c.JSON(fiber.Map{"message": "acknowledged"})
}

func (h *ReadStateHandler) GetUnread(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	channels, err := h.readStateService.GetUnreadCounts(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get unread counts"})
	}
	dms, err := h.readStateService.GetDMUnreadCounts(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get DM unread counts"})
	}
	return c.JSON(fiber.Map{
		"channels": channels,
		"dms":      dms,
	})
}
