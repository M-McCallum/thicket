package handler

import (
	"errors"
	"log"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type StageHandler struct {
	stageService  *service.StageService
	serverService *service.ServerService
	hub           *ws.Hub
}

func NewStageHandler(ss *service.StageService, serverSvc *service.ServerService, hub *ws.Hub) *StageHandler {
	return &StageHandler{stageService: ss, serverService: serverSvc, hub: hub}
}

// StartStage creates a new stage instance on a voice channel.
func (h *StageHandler) StartStage(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var body struct {
		Topic string `json:"topic"`
	}
	_ = c.Bind().JSON(&body)

	userID := auth.GetUserID(c)
	instance, err := h.stageService.StartStage(c.Context(), channelID, userID, body.Topic)
	if err != nil {
		return handleStageError(c, err)
	}

	// Broadcast STAGE_START to server members
	h.broadcastStageEvent(c, channelID, ws.EventStageStart, fiber.Map{
		"channel_id": channelID,
		"instance":   instance,
		"started_by": userID,
	})

	return c.Status(fiber.StatusCreated).JSON(instance)
}

// EndStage removes the stage instance.
func (h *StageHandler) EndStage(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.stageService.EndStage(c.Context(), channelID, userID); err != nil {
		return handleStageError(c, err)
	}

	h.broadcastStageEvent(c, channelID, ws.EventStageEnd, fiber.Map{
		"channel_id": channelID,
	})

	return c.JSON(fiber.Map{"message": "stage ended"})
}

// GetStageInfo returns the current stage info (instance, speakers, hand raises).
func (h *StageHandler) GetStageInfo(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	info, err := h.stageService.GetStageInfo(c.Context(), channelID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get stage info"})
	}

	return c.JSON(info)
}

// AddSpeaker adds the current user as a speaker (must be invited).
func (h *StageHandler) AddSpeaker(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	userID := auth.GetUserID(c)
	username := auth.GetUsername(c)
	speaker, err := h.stageService.AddSpeaker(c.Context(), channelID, userID)
	if err != nil {
		return handleStageError(c, err)
	}

	h.broadcastStageEvent(c, channelID, ws.EventStageSpeakerAdd, fiber.Map{
		"channel_id": channelID,
		"user_id":    userID,
		"username":   username,
		"invited":    speaker.Invited,
	})

	return c.Status(fiber.StatusCreated).JSON(speaker)
}

// RemoveSpeaker removes a speaker from the stage.
func (h *StageHandler) RemoveSpeaker(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	targetUserID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	actingUserID := auth.GetUserID(c)
	if err := h.stageService.RemoveSpeaker(c.Context(), channelID, targetUserID, actingUserID); err != nil {
		return handleStageError(c, err)
	}

	h.broadcastStageEvent(c, channelID, ws.EventStageSpeakerRemove, fiber.Map{
		"channel_id": channelID,
		"user_id":    targetUserID,
	})

	return c.JSON(fiber.Map{"message": "speaker removed"})
}

// RaiseHand records a hand raise.
func (h *StageHandler) RaiseHand(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	userID := auth.GetUserID(c)
	username := auth.GetUsername(c)
	_, err = h.stageService.RaiseHand(c.Context(), channelID, userID)
	if err != nil {
		return handleStageError(c, err)
	}

	h.broadcastStageEvent(c, channelID, ws.EventStageHandRaise, fiber.Map{
		"channel_id": channelID,
		"user_id":    userID,
		"username":   username,
	})

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "hand raised"})
}

// LowerHand removes a hand raise.
func (h *StageHandler) LowerHand(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.stageService.LowerHand(c.Context(), channelID, userID); err != nil {
		return handleStageError(c, err)
	}

	h.broadcastStageEvent(c, channelID, ws.EventStageHandLower, fiber.Map{
		"channel_id": channelID,
		"user_id":    userID,
	})

	return c.JSON(fiber.Map{"message": "hand lowered"})
}

// InviteToSpeak invites a user to become a speaker.
func (h *StageHandler) InviteToSpeak(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	targetUserID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	actingUserID := auth.GetUserID(c)
	speaker, err := h.stageService.InviteToSpeak(c.Context(), channelID, targetUserID, actingUserID)
	if err != nil {
		return handleStageError(c, err)
	}

	h.broadcastStageEvent(c, channelID, ws.EventStageSpeakerAdd, fiber.Map{
		"channel_id": channelID,
		"user_id":    targetUserID,
		"invited":    speaker.Invited,
	})

	return c.JSON(fiber.Map{"message": "user invited to speak"})
}

// broadcastStageEvent sends a stage event to all members of the channel's server.
func (h *StageHandler) broadcastStageEvent(c fiber.Ctx, channelID uuid.UUID, eventType string, data any) {
	serverID, err := h.stageService.GetChannelServerID(c.Context(), channelID)
	if err != nil {
		log.Printf("Failed to get server ID for stage broadcast: %v", err)
		return
	}

	memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), serverID)
	if err != nil {
		log.Printf("Failed to get member IDs for stage broadcast: %v", err)
		return
	}

	event, err := ws.NewEvent(eventType, data)
	if err != nil {
		log.Printf("Failed to create stage event: %v", err)
		return
	}

	ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
}

func handleStageError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrStageAlreadyActive):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrStageNotActive):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotInvited):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrAlreadySpeaker):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrChannelNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
