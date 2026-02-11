package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/mitchell/neoncore/internal/auth"
	"github.com/mitchell/neoncore/internal/service"
)

type ServerHandler struct {
	serverService  *service.ServerService
	channelService *service.ChannelService
}

func NewServerHandler(ss *service.ServerService, cs *service.ChannelService) *ServerHandler {
	return &ServerHandler{serverService: ss, channelService: cs}
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
	server, err := h.serverService.JoinServer(c.Context(), body.InviteCode, userID)
	if err != nil {
		return handleServerError(c, err)
	}

	return c.JSON(server)
}

func (h *ServerHandler) LeaveServer(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.serverService.LeaveServer(c.Context(), serverID, userID); err != nil {
		return handleServerError(c, err)
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

	return c.JSON(members)
}

// Channel endpoints nested under servers
func (h *ServerHandler) CreateChannel(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	channel, err := h.channelService.CreateChannel(c.Context(), serverID, userID, body.Name, body.Type)
	if err != nil {
		return handleServerError(c, err)
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
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
