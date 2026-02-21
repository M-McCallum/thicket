package handler

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type InviteHandler struct {
	inviteService *service.InviteService
	serverService *service.ServerService
	dmService     *service.DMService
	hub           *ws.Hub
}

func NewInviteHandler(is *service.InviteService, ss *service.ServerService, ds *service.DMService, hub *ws.Hub) *InviteHandler {
	return &InviteHandler{inviteService: is, serverService: ss, dmService: ds, hub: hub}
}

func (h *InviteHandler) CreateInvite(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		MaxUses   *int       `json:"max_uses"`
		ExpiresAt *time.Time `json:"expires_at"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	invite, err := h.inviteService.CreateInvite(c.Context(), serverID, userID, body.MaxUses, body.ExpiresAt)
	if err != nil {
		return handleInviteError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(invite)
}

func (h *InviteHandler) ListInvites(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	invites, err := h.inviteService.ListInvites(c.Context(), serverID, userID)
	if err != nil {
		return handleInviteError(c, err)
	}

	return c.JSON(invites)
}

func (h *InviteHandler) DeleteInvite(c fiber.Ctx) error {
	inviteID, err := uuid.Parse(c.Params("inviteId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid invite ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.inviteService.DeleteInvite(c.Context(), inviteID, userID); err != nil {
		return handleInviteError(c, err)
	}

	return c.JSON(fiber.Map{"message": "invite deleted"})
}

func (h *InviteHandler) UseInvite(c fiber.Ctx) error {
	var body struct {
		Code string `json:"code"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "code is required"})
	}

	userID := auth.GetUserID(c)
	username := auth.GetUsername(c)
	server, err := h.inviteService.UseInvite(c.Context(), body.Code, userID)
	if err != nil {
		return handleInviteError(c, err)
	}

	// Broadcast MEMBER_JOIN to all server members
	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), server.ID); err == nil {
		event, _ := ws.NewEvent(ws.EventMemberJoin, fiber.Map{
			"server_id": server.ID,
			"user_id":   userID,
			"username":  username,
		})
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	} else {
		log.Printf("Failed to get member IDs for MEMBER_JOIN broadcast: %v", err)
	}

	return c.JSON(server)
}

func (h *InviteHandler) DiscoverServers(c fiber.Ctx) error {
	q := c.Query("q", "")
	limitStr := c.Query("limit", "25")
	offsetStr := c.Query("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 25
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil {
		offset = 0
	}

	results, err := h.inviteService.GetPublicServers(c.Context(), q, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to search servers"})
	}

	return c.JSON(results)
}

func (h *InviteHandler) InviteByUsername(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Username string `json:"username"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "username is required"})
	}

	senderID := auth.GetUserID(c)
	invitation, recipientID, err := h.inviteService.SendInviteByUsername(c.Context(), serverID, senderID, body.Username)
	if err != nil {
		return handleInviteError(c, err)
	}

	// Send WS event to recipient
	invEvent, _ := ws.NewEvent(ws.EventServerInvitationReceived, invitation)
	if invEvent != nil {
		h.hub.SendToUser(recipientID, invEvent)
	}

	// Auto-create or find DM conversation and send system message
	go func() {
		ctx := context.Background()
		conv, err := h.dmService.CreateConversation(ctx, senderID, recipientID)
		if err != nil {
			log.Printf("Failed to create DM for server invitation: %v", err)
			return
		}
		content := fmt.Sprintf("Hey! I've invited you to join **%s**. Check your server invites to accept!", invitation.ServerName)
		msg, err := h.dmService.SendDM(ctx, conv.ID, senderID, content)
		if err != nil {
			log.Printf("Failed to send invite DM: %v", err)
			return
		}
		dmEvent, _ := ws.NewEvent(ws.EventDMMessageCreate, msg)
		if dmEvent != nil {
			h.hub.SendToUser(recipientID, dmEvent)
			h.hub.SendToUser(senderID, dmEvent)
		}
	}()

	return c.Status(fiber.StatusCreated).JSON(invitation)
}

func (h *InviteHandler) AcceptInvitation(c fiber.Ctx) error {
	invitationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid invitation ID"})
	}

	userID := auth.GetUserID(c)
	username := auth.GetUsername(c)
	server, inv, err := h.inviteService.AcceptInvitation(c.Context(), invitationID, userID)
	if err != nil {
		return handleInviteError(c, err)
	}

	// Broadcast MEMBER_JOIN to server members
	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), server.ID); err == nil {
		event, _ := ws.NewEvent(ws.EventMemberJoin, fiber.Map{
			"server_id": server.ID,
			"user_id":   userID,
			"username":  username,
		})
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	} else {
		log.Printf("Failed to get member IDs for MEMBER_JOIN broadcast: %v", err)
	}

	// Notify sender
	acceptEvent, _ := ws.NewEvent(ws.EventServerInvitationAccepted, fiber.Map{
		"invitation_id": inv.ID,
		"server_id":     inv.ServerID,
		"recipient_id":  userID,
		"username":      username,
	})
	if acceptEvent != nil {
		h.hub.SendToUser(inv.SenderID, acceptEvent)
	}

	return c.JSON(server)
}

func (h *InviteHandler) DeclineInvitation(c fiber.Ctx) error {
	invitationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid invitation ID"})
	}

	userID := auth.GetUserID(c)
	inv, err := h.inviteService.DeclineInvitation(c.Context(), invitationID, userID)
	if err != nil {
		return handleInviteError(c, err)
	}

	// Notify sender
	declineEvent, _ := ws.NewEvent(ws.EventServerInvitationDeclined, fiber.Map{
		"invitation_id": inv.ID,
		"server_id":     inv.ServerID,
		"recipient_id":  userID,
	})
	if declineEvent != nil {
		h.hub.SendToUser(inv.SenderID, declineEvent)
	}

	return c.JSON(fiber.Map{"message": "invitation declined"})
}

func (h *InviteHandler) GetReceivedInvitations(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	invitations, err := h.inviteService.GetReceivedInvitations(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get invitations"})
	}
	return c.JSON(invitations)
}

func (h *InviteHandler) GetSentInvitations(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	invitations, err := h.inviteService.GetSentInvitations(c.Context(), userID, serverID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get invitations"})
	}
	return c.JSON(invitations)
}

func handleInviteError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrInviteNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvitationNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInviteExpired):
		return c.Status(fiber.StatusGone).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInviteMaxUsed):
		return c.Status(fiber.StatusGone).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrAlreadyMember):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrRecipientAlreadyMember):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvitationAlreadySent):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrCannotInviteSelf):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrUserNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
