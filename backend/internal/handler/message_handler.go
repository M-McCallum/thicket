package handler

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type MessageHandler struct {
	messageService *service.MessageService
	hub            *ws.Hub
}

func NewMessageHandler(ms *service.MessageService, hub *ws.Hub) *MessageHandler {
	return &MessageHandler{messageService: ms, hub: hub}
}

func (h *MessageHandler) SendMessage(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	msg, err := h.messageService.SendMessage(c.Context(), channelID, userID, body.Content)
	if err != nil {
		return handleMessageError(c, err)
	}

	// Broadcast via WebSocket
	event, _ := ws.NewEvent(ws.EventMessageCreate, fiber.Map{
		"id":         msg.ID,
		"channel_id": msg.ChannelID,
		"author_id":  msg.AuthorID,
		"content":    msg.Content,
		"created_at": msg.CreatedAt,
		"username":   auth.GetUsername(c),
	})
	if event != nil {
		h.hub.BroadcastToChannel(channelID.String(), event, nil)
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func (h *MessageHandler) GetMessages(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var before *time.Time
	if b := c.Query("before"); b != "" {
		t, err := time.Parse(time.RFC3339, b)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid before timestamp"})
		}
		before = &t
	}

	limitVal := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limitVal = parsed
		}
	}
	limit := int32(limitVal)
	userID := auth.GetUserID(c)

	messages, err := h.messageService.GetMessages(c.Context(), channelID, userID, before, limit)
	if err != nil {
		return handleMessageError(c, err)
	}

	return c.JSON(messages)
}

func (h *MessageHandler) UpdateMessage(c fiber.Ctx) error {
	messageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	msg, err := h.messageService.UpdateMessage(c.Context(), messageID, userID, body.Content)
	if err != nil {
		return handleMessageError(c, err)
	}

	event, _ := ws.NewEvent(ws.EventMessageUpdate, msg)
	if event != nil {
		h.hub.BroadcastToChannel(msg.ChannelID.String(), event, nil)
	}

	return c.JSON(msg)
}

func (h *MessageHandler) DeleteMessage(c fiber.Ctx) error {
	messageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.messageService.DeleteMessage(c.Context(), messageID, userID); err != nil {
		return handleMessageError(c, err)
	}

	return c.JSON(fiber.Map{"message": "deleted"})
}

func handleMessageError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrChannelNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrMessageNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotAuthor):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyMessage):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
