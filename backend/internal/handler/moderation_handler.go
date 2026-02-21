package handler

import (
	"errors"
	"log"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type ModerationHandler struct {
	modService    *service.ModerationService
	serverService *service.ServerService
	hub           *ws.Hub
}

func NewModerationHandler(modSvc *service.ModerationService, serverSvc *service.ServerService, hub *ws.Hub) *ModerationHandler {
	return &ModerationHandler{modService: modSvc, serverService: serverSvc, hub: hub}
}

func (h *ModerationHandler) BanUser(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		UserID string `json:"user_id"`
		Reason string `json:"reason"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.UserID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_id is required"})
	}

	targetID, err := uuid.Parse(body.UserID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user_id"})
	}

	actorID := auth.GetUserID(c)

	// Get member IDs before ban (target is still a member)
	memberIDs, _ := h.serverService.GetServerMemberUserIDs(c.Context(), serverID)

	ban, err := h.modService.BanUser(c.Context(), serverID, targetID, actorID, body.Reason)
	if err != nil {
		return handleModerationError(c, err)
	}

	// Broadcast MEMBER_LEAVE to all server members
	event, _ := ws.NewEvent(ws.EventMemberLeave, fiber.Map{
		"server_id": serverID,
		"user_id":   targetID,
	})
	if event != nil {
		ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
	}

	return c.Status(fiber.StatusCreated).JSON(ban)
}

func (h *ModerationHandler) UnbanUser(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	targetID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	actorID := auth.GetUserID(c)
	if err := h.modService.UnbanUser(c.Context(), serverID, targetID, actorID); err != nil {
		return handleModerationError(c, err)
	}

	return c.JSON(fiber.Map{"message": "user unbanned"})
}

func (h *ModerationHandler) GetBans(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	actorID := auth.GetUserID(c)
	bans, err := h.modService.GetBans(c.Context(), serverID, actorID)
	if err != nil {
		return handleModerationError(c, err)
	}

	return c.JSON(bans)
}

func (h *ModerationHandler) KickUser(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	targetID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.Bind().JSON(&body)

	actorID := auth.GetUserID(c)

	// Get member IDs before kick
	memberIDs, _ := h.serverService.GetServerMemberUserIDs(c.Context(), serverID)

	if err := h.modService.KickUser(c.Context(), serverID, targetID, actorID, body.Reason); err != nil {
		return handleModerationError(c, err)
	}

	event, _ := ws.NewEvent(ws.EventMemberLeave, fiber.Map{
		"server_id": serverID,
		"user_id":   targetID,
	})
	if event != nil {
		ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
	}

	return c.JSON(fiber.Map{"message": "user kicked"})
}

func (h *ModerationHandler) TimeoutUser(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	targetID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	var body struct {
		Reason   string `json:"reason"`
		Duration int    `json:"duration"` // seconds
	}
	if err := c.Bind().JSON(&body); err != nil || body.Duration <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "duration (in seconds) is required"})
	}

	actorID := auth.GetUserID(c)
	duration := time.Duration(body.Duration) * time.Second

	timeout, err := h.modService.TimeoutUser(c.Context(), serverID, targetID, actorID, body.Reason, duration)
	if err != nil {
		return handleModerationError(c, err)
	}

	// Broadcast timeout to server members
	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), serverID); err == nil {
		event, _ := ws.NewEvent("MEMBER_TIMEOUT", fiber.Map{
			"server_id":  serverID,
			"user_id":    targetID,
			"expires_at": timeout.ExpiresAt,
			"reason":     timeout.Reason,
		})
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	} else {
		log.Printf("Failed to get member IDs for MEMBER_TIMEOUT broadcast: %v", err)
	}

	return c.Status(fiber.StatusCreated).JSON(timeout)
}

func (h *ModerationHandler) RemoveTimeout(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	targetID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	actorID := auth.GetUserID(c)
	if err := h.modService.RemoveTimeout(c.Context(), serverID, targetID, actorID); err != nil {
		return handleModerationError(c, err)
	}

	return c.JSON(fiber.Map{"message": "timeout removed"})
}

func (h *ModerationHandler) GetTimeouts(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	actorID := auth.GetUserID(c)
	timeouts, err := h.modService.GetTimeouts(c.Context(), serverID, actorID)
	if err != nil {
		return handleModerationError(c, err)
	}

	return c.JSON(timeouts)
}

func (h *ModerationHandler) GetAuditLog(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	actorID := auth.GetUserID(c)

	var limit int32 = 50
	if l := c.Query("limit"); l != "" {
		if n, err := fiber.Convert(l, func(s string) (int32, error) {
			var v int32
			for _, c := range s {
				v = v*10 + int32(c-'0')
			}
			return v, nil
		}); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	var before *time.Time
	if b := c.Query("before"); b != "" {
		if t, err := time.Parse(time.RFC3339Nano, b); err == nil {
			before = &t
		}
	}

	entries, err := h.modService.GetAuditLog(c.Context(), serverID, actorID, limit, before)
	if err != nil {
		return handleModerationError(c, err)
	}

	return c.JSON(entries)
}

func handleModerationError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrServerNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user is not a member"})
	case errors.Is(err, service.ErrCannotModOwner):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrBanNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrTimeoutNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrUserBanned):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrUserTimedOut):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
