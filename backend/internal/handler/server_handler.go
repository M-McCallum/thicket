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

type ServerHandler struct {
	serverService  *service.ServerService
	channelService *service.ChannelService
	hub            *ws.Hub
}

func NewServerHandler(ss *service.ServerService, cs *service.ChannelService, hub *ws.Hub) *ServerHandler {
	return &ServerHandler{serverService: ss, channelService: cs, hub: hub}
}

func (h *ServerHandler) CreateServer(c fiber.Ctx) error {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	server, channel, err := h.serverService.CreateServer(c.Context(), body.Name, userID)
	if err != nil {
		return handleServerError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"server":  server,
		"channel": channel,
	})
}

func (h *ServerHandler) GetServer(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	server, err := h.serverService.GetServer(c.Context(), serverID, userID)
	if err != nil {
		return handleServerError(c, err)
	}

	return c.JSON(server)
}

func (h *ServerHandler) GetUserServers(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	servers, err := h.serverService.GetUserServers(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get servers"})
	}

	return c.JSON(servers)
}

func (h *ServerHandler) JoinServer(c fiber.Ctx) error {
	var body struct {
		InviteCode string `json:"invite_code"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.InviteCode == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invite_code is required"})
	}

	userID := auth.GetUserID(c)
	username := auth.GetUsername(c)
	server, err := h.serverService.JoinServer(c.Context(), body.InviteCode, userID)
	if err != nil {
		return handleServerError(c, err)
	}

	// Broadcast MEMBER_JOIN to all server members (including the new member)
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

func (h *ServerHandler) LeaveServer(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)

	// Query member IDs BEFORE leave (user is still a member)
	memberIDs, _ := h.serverService.GetServerMemberUserIDs(c.Context(), serverID)

	if err := h.serverService.LeaveServer(c.Context(), serverID, userID); err != nil {
		return handleServerError(c, err)
	}

	event, _ := ws.NewEvent(ws.EventMemberLeave, fiber.Map{
		"server_id": serverID,
		"user_id":   userID,
	})
	if event != nil {
		ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
	}

	return c.JSON(fiber.Map{"message": "left server"})
}

func (h *ServerHandler) DeleteServer(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.serverService.DeleteServer(c.Context(), serverID, userID); err != nil {
		return handleServerError(c, err)
	}

	return c.JSON(fiber.Map{"message": "server deleted"})
}

func (h *ServerHandler) GetMembers(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	members, err := h.serverService.GetMembers(c.Context(), serverID, userID)
	if err != nil {
		return handleServerError(c, err)
	}

	for i := range members {
		if members[i].AvatarURL != nil {
			proxyURL := "/api/files/" + *members[i].AvatarURL
			members[i].AvatarURL = &proxyURL
		}
	}

	return c.JSON(members)
}

// Channel endpoints nested under servers
func (h *ServerHandler) CreateChannel(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Name           string `json:"name"`
		Type           string `json:"type"`
		IsAnnouncement bool   `json:"is_announcement"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	channel, err := h.channelService.CreateChannel(c.Context(), serverID, userID, body.Name, body.Type, body.IsAnnouncement)
	if err != nil {
		return handleServerError(c, err)
	}

	// Broadcast CHANNEL_CREATE to all server members
	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), serverID); err == nil {
		event, _ := ws.NewEvent(ws.EventChannelCreate, channel)
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	}

	return c.Status(fiber.StatusCreated).JSON(channel)
}

func (h *ServerHandler) GetChannels(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	channels, err := h.channelService.GetChannels(c.Context(), serverID, userID)
	if err != nil {
		return handleServerError(c, err)
	}

	return c.JSON(channels)
}

func (h *ServerHandler) DeleteChannel(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	// Query member IDs before delete so we can broadcast
	memberIDs, _ := h.serverService.GetServerMemberUserIDs(c.Context(), serverID)

	userID := auth.GetUserID(c)
	if err := h.channelService.DeleteChannel(c.Context(), channelID, userID); err != nil {
		return handleServerError(c, err)
	}

	event, _ := ws.NewEvent(ws.EventChannelDelete, fiber.Map{
		"id":        channelID,
		"server_id": serverID,
	})
	if event != nil {
		ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
	}

	return c.JSON(fiber.Map{"message": "channel deleted"})
}

func (h *ServerHandler) UpdateServer(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Name                        *string `json:"name"`
		IconURL                     *string `json:"icon_url"`
		IsPublic                    *bool   `json:"is_public"`
		Description                 *string `json:"description"`
		GifsEnabled                 *bool   `json:"gifs_enabled"`
		DefaultMessageRetentionDays *int    `json:"default_message_retention_days"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	server, err := h.serverService.UpdateServer(c.Context(), serverID, userID, body.Name, body.IconURL, body.IsPublic, body.Description, body.GifsEnabled, body.DefaultMessageRetentionDays)
	if err != nil {
		return handleServerError(c, err)
	}

	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), serverID); err == nil {
		event, _ := ws.NewEvent(ws.EventServerUpdate, server)
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	}

	return c.JSON(server)
}

func (h *ServerHandler) SetNickname(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Nickname *string `json:"nickname"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	if err := h.serverService.SetNickname(c.Context(), serverID, userID, body.Nickname); err != nil {
		return handleServerError(c, err)
	}

	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), serverID); err == nil {
		event, _ := ws.NewEvent(ws.EventMemberUpdate, fiber.Map{
			"server_id": serverID,
			"user_id":   userID,
			"nickname":  body.Nickname,
		})
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	}

	return c.JSON(fiber.Map{"message": "nickname updated"})
}

func (h *ServerHandler) UpdateChannel(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var body struct {
		Name             *string    `json:"name"`
		Topic            *string    `json:"topic"`
		CategoryID       *uuid.UUID `json:"category_id"`
		SlowModeInterval *int       `json:"slow_mode_interval"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	channel, err := h.serverService.UpdateChannel(c.Context(), serverID, channelID, userID, body.Name, body.Topic, body.CategoryID, body.SlowModeInterval)
	if err != nil {
		return handleServerError(c, err)
	}

	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), serverID); err == nil {
		event, _ := ws.NewEvent(ws.EventChannelUpdate, channel)
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	}

	return c.JSON(channel)
}

// Category endpoints

func (h *ServerHandler) CreateCategory(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Name     string `json:"name"`
		Position int32  `json:"position"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	cat, err := h.serverService.CreateCategory(c.Context(), serverID, userID, body.Name, body.Position)
	if err != nil {
		return handleServerError(c, err)
	}

	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), serverID); err == nil {
		event, _ := ws.NewEvent(ws.EventCategoryCreate, cat)
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	}

	return c.Status(fiber.StatusCreated).JSON(cat)
}

func (h *ServerHandler) GetCategories(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	categories, err := h.serverService.GetCategories(c.Context(), serverID, userID)
	if err != nil {
		return handleServerError(c, err)
	}

	return c.JSON(categories)
}

func (h *ServerHandler) UpdateCategory(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	categoryID, err := uuid.Parse(c.Params("categoryId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category ID"})
	}

	var body struct {
		Name     *string `json:"name"`
		Position *int32  `json:"position"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	cat, err := h.serverService.UpdateCategory(c.Context(), serverID, categoryID, userID, body.Name, body.Position)
	if err != nil {
		return handleServerError(c, err)
	}

	if memberIDs, err := h.serverService.GetServerMemberUserIDs(c.Context(), serverID); err == nil {
		event, _ := ws.NewEvent(ws.EventCategoryUpdate, cat)
		if event != nil {
			ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
		}
	}

	return c.JSON(cat)
}

func (h *ServerHandler) DeleteCategory(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	categoryID, err := uuid.Parse(c.Params("categoryId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category ID"})
	}

	memberIDs, _ := h.serverService.GetServerMemberUserIDs(c.Context(), serverID)

	userID := auth.GetUserID(c)
	if err := h.serverService.DeleteCategory(c.Context(), serverID, categoryID, userID); err != nil {
		return handleServerError(c, err)
	}

	event, _ := ws.NewEvent(ws.EventCategoryDelete, fiber.Map{
		"id":        categoryID,
		"server_id": serverID,
	})
	if event != nil {
		ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
	}

	return c.JSON(fiber.Map{"message": "category deleted"})
}

func (h *ServerHandler) GetServerPreview(c fiber.Ctx) error {
	inviteCode := c.Params("code")
	if inviteCode == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invite code required"})
	}

	preview, err := h.serverService.GetServerPreview(c.Context(), inviteCode)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "invalid invite code"})
	}

	return c.JSON(preview)
}

func handleServerError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrServerNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrAlreadyMember):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrOwnerCannotLeave):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidServerName):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidChannelName):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidChannelType):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidNickname):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidCategoryName):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrUserBanned):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrUserTimedOut):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
