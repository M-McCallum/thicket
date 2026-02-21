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

type ThreadHandler struct {
	threadService *service.ThreadService
	hub           *ws.Hub
}

func NewThreadHandler(ts *service.ThreadService, hub *ws.Hub) *ThreadHandler {
	return &ThreadHandler{
		threadService: ts,
		hub:           hub,
	}
}

func (h *ThreadHandler) CreateThread(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var body struct {
		ParentMessageID string `json:"parent_message_id"`
		Name            string `json:"name"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	parentMessageID, err := uuid.Parse(body.ParentMessageID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid parent_message_id"})
	}

	userID := auth.GetUserID(c)
	thread, err := h.threadService.CreateThread(c.Context(), channelID, parentMessageID, body.Name, userID)
	if err != nil {
		return handleThreadError(c, err)
	}

	// Broadcast thread creation to the channel
	event, _ := ws.NewEvent(ws.EventThreadCreate, thread)
	if event != nil {
		h.hub.BroadcastToChannel(channelID.String(), event, nil)
	}

	return c.Status(fiber.StatusCreated).JSON(thread)
}

func (h *ThreadHandler) GetThread(c fiber.Ctx) error {
	threadID, err := uuid.Parse(c.Params("threadId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid thread ID"})
	}

	thread, err := h.threadService.GetThread(c.Context(), threadID)
	if err != nil {
		return handleThreadError(c, err)
	}

	return c.JSON(thread)
}

func (h *ThreadHandler) ListThreads(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	threads, err := h.threadService.GetThreadsByChannel(c.Context(), channelID)
	if err != nil {
		return handleThreadError(c, err)
	}

	return c.JSON(threads)
}

func (h *ThreadHandler) UpdateThread(c fiber.Ctx) error {
	threadID, err := uuid.Parse(c.Params("threadId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid thread ID"})
	}

	var body struct {
		Name     *string `json:"name"`
		Archived *bool   `json:"archived"`
		Locked   *bool   `json:"locked"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// Get current thread to merge with updates
	current, err := h.threadService.GetThread(c.Context(), threadID)
	if err != nil {
		return handleThreadError(c, err)
	}

	name := current.Name
	if body.Name != nil {
		name = *body.Name
	}
	archived := current.Archived
	if body.Archived != nil {
		archived = *body.Archived
	}
	locked := current.Locked
	if body.Locked != nil {
		locked = *body.Locked
	}

	thread, err := h.threadService.UpdateThread(c.Context(), threadID, name, archived, locked)
	if err != nil {
		return handleThreadError(c, err)
	}

	// Broadcast thread update to the channel
	event, _ := ws.NewEvent(ws.EventThreadUpdate, thread)
	if event != nil {
		h.hub.BroadcastToChannel(thread.ChannelID.String(), event, nil)
	}

	return c.JSON(thread)
}

func (h *ThreadHandler) SendMessage(c fiber.Ctx) error {
	threadID, err := uuid.Parse(c.Params("threadId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid thread ID"})
	}

	var body struct {
		Content   string  `json:"content"`
		ReplyToID *string `json:"reply_to_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var replyToID *uuid.UUID
	if body.ReplyToID != nil && *body.ReplyToID != "" {
		parsed, err := uuid.Parse(*body.ReplyToID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid reply_to_id"})
		}
		replyToID = &parsed
	}

	userID := auth.GetUserID(c)
	msg, err := h.threadService.SendThreadMessage(c.Context(), threadID, userID, body.Content, replyToID)
	if err != nil {
		return handleThreadError(c, err)
	}

	// Get the thread to find the channel for broadcast
	thread, _ := h.threadService.GetThread(c.Context(), threadID)
	if thread != nil {
		event, _ := ws.NewEvent(ws.EventThreadMessageCreate, fiber.Map{
			"id":                  msg.ID,
			"thread_id":           msg.ThreadID,
			"author_id":           msg.AuthorID,
			"content":             msg.Content,
			"reply_to_id":         msg.ReplyToID,
			"created_at":          msg.CreatedAt,
			"updated_at":          msg.UpdatedAt,
			"author_username":     msg.AuthorUsername,
			"author_display_name": msg.AuthorDisplayName,
			"author_avatar_url":   msg.AuthorAvatarURL,
			"channel_id":          thread.ChannelID,
			"message_count":       thread.MessageCount,
		})
		if event != nil {
			h.hub.BroadcastToChannel(thread.ChannelID.String(), event, nil)
		}
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func (h *ThreadHandler) DeleteMessage(c fiber.Ctx) error {
	threadID, err := uuid.Parse(c.Params("threadId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid thread ID"})
	}
	messageID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	userID := auth.GetUserID(c)
	thread, err := h.threadService.DeleteThreadMessage(c.Context(), threadID, messageID, userID)
	if err != nil {
		return handleThreadError(c, err)
	}

	event, _ := ws.NewEvent(ws.EventThreadMessageDelete, fiber.Map{
		"id":         messageID,
		"thread_id":  threadID,
		"channel_id": thread.ChannelID,
	})
	if event != nil {
		h.hub.BroadcastToChannel(thread.ChannelID.String(), event, nil)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *ThreadHandler) GetMessages(c fiber.Ctx) error {
	threadID, err := uuid.Parse(c.Params("threadId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid thread ID"})
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

	messages, err := h.threadService.GetThreadMessages(c.Context(), threadID, before, limit)
	if err != nil {
		return handleThreadError(c, err)
	}

	return c.JSON(messages)
}

func (h *ThreadHandler) UpdateSubscription(c fiber.Ctx) error {
	threadID, err := uuid.Parse(c.Params("threadId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid thread ID"})
	}

	var body struct {
		NotificationLevel string `json:"notification_level"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if body.NotificationLevel == "" {
		body.NotificationLevel = "all"
	}

	userID := auth.GetUserID(c)
	sub, err := h.threadService.UpdateSubscription(c.Context(), threadID, userID, body.NotificationLevel)
	if err != nil {
		return handleThreadError(c, err)
	}

	return c.JSON(sub)
}

func handleThreadError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrThreadNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrThreadLocked):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrThreadArchived):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrChannelNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrMessageNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrMessageNotInChannel):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyMessage):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		if err.Error() == "thread already exists for this message" {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
