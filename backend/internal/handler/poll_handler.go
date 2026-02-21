package handler

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type PollHandler struct {
	pollSvc *service.PollService
	hub     *ws.Hub
}

func NewPollHandler(ps *service.PollService, hub *ws.Hub) *PollHandler {
	return &PollHandler{pollSvc: ps, hub: hub}
}

func (h *PollHandler) CreatePoll(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var body struct {
		Question    string                    `json:"question"`
		Options     []service.PollOptionInput `json:"options"`
		MultiSelect bool                      `json:"multi_select"`
		Anonymous   bool                      `json:"anonymous"`
		ExpiresAt   *string                   `json:"expires_at"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var expiresAt *time.Time
	if body.ExpiresAt != nil && *body.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *body.ExpiresAt)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid expires_at format (use RFC3339)"})
		}
		expiresAt = &t
	}

	userID := auth.GetUserID(c)
	poll, err := h.pollSvc.CreatePoll(c.Context(), channelID, userID, body.Question, body.Options, body.MultiSelect, body.Anonymous, expiresAt)
	if err != nil {
		return handlePollError(c, err)
	}

	// Broadcast to channel subscribers
	h.broadcastPollToChannel(channelID.String(), ws.EventPollCreate, poll)

	return c.Status(fiber.StatusCreated).JSON(poll)
}

func (h *PollHandler) GetPoll(c fiber.Ctx) error {
	pollID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid poll ID"})
	}

	userID := auth.GetUserID(c)
	poll, err := h.pollSvc.GetPoll(c.Context(), pollID, userID)
	if err != nil {
		return handlePollError(c, err)
	}

	return c.JSON(poll)
}

func (h *PollHandler) Vote(c fiber.Ctx) error {
	pollID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid poll ID"})
	}

	var body struct {
		OptionID string `json:"option_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	optionID, err := uuid.Parse(body.OptionID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid option_id"})
	}

	userID := auth.GetUserID(c)
	if err := h.pollSvc.Vote(c.Context(), pollID, optionID, userID); err != nil {
		return handlePollError(c, err)
	}

	// Re-fetch poll and broadcast updated vote counts
	poll, _ := h.pollSvc.GetPoll(c.Context(), pollID, userID)
	if poll != nil {
		channelID := h.pollSvc.GetPollChannelID(c.Context(), pollID)
		if channelID != "" {
			h.broadcastPollToChannel(channelID, ws.EventPollVote, poll)
		}
	}

	return c.JSON(fiber.Map{"message": "vote recorded"})
}

func (h *PollHandler) RemoveVote(c fiber.Ctx) error {
	pollID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid poll ID"})
	}

	optionID, err := uuid.Parse(c.Params("optionId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid option ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.pollSvc.RemoveVote(c.Context(), pollID, optionID, userID); err != nil {
		return handlePollError(c, err)
	}

	// Re-fetch poll and broadcast updated vote counts
	poll, _ := h.pollSvc.GetPoll(c.Context(), pollID, userID)
	if poll != nil {
		channelID := h.pollSvc.GetPollChannelID(c.Context(), pollID)
		if channelID != "" {
			h.broadcastPollToChannel(channelID, ws.EventPollVote, poll)
		}
	}

	return c.JSON(fiber.Map{"message": "vote removed"})
}

func (h *PollHandler) broadcastPollToChannel(channelID string, eventType string, data *models.PollWithOptions) {
	event, err := ws.NewEvent(eventType, data)
	if err != nil {
		return
	}
	h.hub.BroadcastToChannel(channelID, event, nil)
}

func handlePollError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrPollNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrPollExpired):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidQuestion):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrTooFewOptions):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrTooManyOptions):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrOptionNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
