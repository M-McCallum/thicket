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

type DMHandler struct {
	dmService *service.DMService
	hub       *ws.Hub
}

func NewDMHandler(ds *service.DMService, hub *ws.Hub) *DMHandler {
	return &DMHandler{dmService: ds, hub: hub}
}

func (h *DMHandler) CreateConversation(c fiber.Ctx) error {
	var body struct {
		ParticipantID string `json:"participant_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	participantID, err := uuid.Parse(body.ParticipantID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid participant ID"})
	}

	userID := auth.GetUserID(c)
	conv, err := h.dmService.CreateConversation(c.Context(), userID, participantID)
	if err != nil {
		return handleDMError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(conv)
}

func (h *DMHandler) GetConversations(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	convos, err := h.dmService.GetConversations(c.Context(), userID)
	if err != nil {
		return handleDMError(c, err)
	}

	return c.JSON(convos)
}

func (h *DMHandler) GetDMMessages(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
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

	messages, err := h.dmService.GetDMMessages(c.Context(), conversationID, userID, before, limit)
	if err != nil {
		return handleDMError(c, err)
	}

	return c.JSON(messages)
}

func (h *DMHandler) SendDM(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	msg, err := h.dmService.SendDM(c.Context(), conversationID, userID, body.Content)
	if err != nil {
		return handleDMError(c, err)
	}

	// Broadcast to all participants via SendToUser
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMMessageCreate, fiber.Map{
			"id":              msg.ID,
			"conversation_id": msg.ConversationID,
			"author_id":       msg.AuthorID,
			"content":         msg.Content,
			"created_at":      msg.CreatedAt,
			"username":        auth.GetUsername(c),
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func handleDMError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrConversationNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotDMParticipant):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrCannotDMSelf):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyMessage):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
