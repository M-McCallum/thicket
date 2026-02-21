package handler

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type ScheduleHandler struct {
	schedulerService *service.SchedulerService
}

func NewScheduleHandler(ss *service.SchedulerService) *ScheduleHandler {
	return &ScheduleHandler{schedulerService: ss}
}

func (h *ScheduleHandler) ListScheduledMessages(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	messages, err := h.schedulerService.GetScheduledMessages(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
	return c.JSON(messages)
}

func (h *ScheduleHandler) CreateScheduledMessage(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	var body struct {
		ChannelID        *string `json:"channel_id"`
		DMConversationID *string `json:"dm_conversation_id"`
		Content          string  `json:"content"`
		Type             string  `json:"type"`
		ScheduledAt      string  `json:"scheduled_at"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "content is required"})
	}
	if body.ScheduledAt == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "scheduled_at is required"})
	}

	scheduledAt, err := time.Parse(time.RFC3339, body.ScheduledAt)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid scheduled_at format, use RFC3339"})
	}

	var channelID *uuid.UUID
	if body.ChannelID != nil {
		parsed, err := uuid.Parse(*body.ChannelID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel_id"})
		}
		channelID = &parsed
	}

	var dmConversationID *uuid.UUID
	if body.DMConversationID != nil {
		parsed, err := uuid.Parse(*body.DMConversationID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid dm_conversation_id"})
		}
		dmConversationID = &parsed
	}

	msg, err := h.schedulerService.CreateScheduledMessage(c.Context(), userID, channelID, dmConversationID, body.Content, body.Type, scheduledAt)
	if err != nil {
		return handleScheduleError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func (h *ScheduleHandler) UpdateScheduledMessage(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid scheduled message ID"})
	}

	userID := auth.GetUserID(c)

	var body struct {
		Content     string `json:"content"`
		ScheduledAt string `json:"scheduled_at"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "content is required"})
	}
	if body.ScheduledAt == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "scheduled_at is required"})
	}

	scheduledAt, err := time.Parse(time.RFC3339, body.ScheduledAt)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid scheduled_at format, use RFC3339"})
	}

	msg, err := h.schedulerService.UpdateScheduledMessage(c.Context(), id, userID, body.Content, scheduledAt)
	if err != nil {
		return handleScheduleError(c, err)
	}

	return c.JSON(msg)
}

func (h *ScheduleHandler) DeleteScheduledMessage(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid scheduled message ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.schedulerService.DeleteScheduledMessage(c.Context(), id, userID); err != nil {
		return handleScheduleError(c, err)
	}

	return c.JSON(fiber.Map{"message": "deleted"})
}

func handleScheduleError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrScheduledMessageNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotScheduleAuthor):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrScheduleInPast):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyMessage):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNoTarget):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
