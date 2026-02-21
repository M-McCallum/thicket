package handler

import (
	"errors"
	"log"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type RoleHandler struct {
	roleSvc   *service.RoleService
	serverSvc *service.ServerService
	hub       *ws.Hub
}

func NewRoleHandler(rs *service.RoleService, ss *service.ServerService, hub *ws.Hub) *RoleHandler {
	return &RoleHandler{roleSvc: rs, serverSvc: ss, hub: hub}
}

func (h *RoleHandler) GetRoles(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	roles, err := h.roleSvc.GetRoles(c.Context(), serverID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get roles"})
	}

	return c.JSON(roles)
}

func (h *RoleHandler) CreateRole(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body struct {
		Name        string  `json:"name"`
		Color       *string `json:"color"`
		Permissions string  `json:"permissions"`
		Hoist       bool    `json:"hoist"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	perms := parsePermissions(body.Permissions)

	userID := auth.GetUserID(c)
	role, err := h.roleSvc.CreateRole(c.Context(), serverID, userID, body.Name, body.Color, perms, body.Hoist)
	if err != nil {
		return handleRoleError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventRoleCreate, role)
	return c.Status(fiber.StatusCreated).JSON(role)
}

func (h *RoleHandler) UpdateRole(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	roleID, err := uuid.Parse(c.Params("roleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role ID"})
	}

	var body struct {
		Name        *string `json:"name"`
		Color       *string `json:"color"`
		Permissions *string `json:"permissions"`
		Hoist       *bool   `json:"hoist"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var perms *int64
	if body.Permissions != nil {
		p := parsePermissions(*body.Permissions)
		perms = &p
	}

	userID := auth.GetUserID(c)
	role, err := h.roleSvc.UpdateRole(c.Context(), serverID, roleID, userID, body.Name, body.Color, perms, body.Hoist)
	if err != nil {
		return handleRoleError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventRoleUpdate, role)
	return c.JSON(role)
}

func (h *RoleHandler) DeleteRole(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	roleID, err := uuid.Parse(c.Params("roleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.roleSvc.DeleteRole(c.Context(), serverID, roleID, userID); err != nil {
		return handleRoleError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventRoleDelete, fiber.Map{
		"id":        roleID,
		"server_id": serverID,
	})
	return c.JSON(fiber.Map{"message": "role deleted"})
}

func (h *RoleHandler) ReorderRoles(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	var body []models.RolePosition
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	if err := h.roleSvc.ReorderRoles(c.Context(), serverID, userID, body); err != nil {
		return handleRoleError(c, err)
	}

	// Re-fetch roles after reorder and broadcast
	roles, _ := h.roleSvc.GetRoles(c.Context(), serverID)
	h.broadcastToServer(c, serverID, ws.EventRoleUpdate, fiber.Map{
		"server_id": serverID,
		"roles":     roles,
	})
	return c.JSON(fiber.Map{"message": "roles reordered"})
}

func (h *RoleHandler) AssignRole(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	targetUserID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	roleID, err := uuid.Parse(c.Params("roleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.roleSvc.AssignRole(c.Context(), serverID, targetUserID, roleID, userID); err != nil {
		return handleRoleError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventMemberRoleUpdate, fiber.Map{
		"server_id": serverID,
		"user_id":   targetUserID,
		"role_id":   roleID,
		"action":    "assign",
	})
	return c.JSON(fiber.Map{"message": "role assigned"})
}

func (h *RoleHandler) RemoveRoleFromMember(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	targetUserID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	roleID, err := uuid.Parse(c.Params("roleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.roleSvc.RemoveRole(c.Context(), serverID, targetUserID, roleID, userID); err != nil {
		return handleRoleError(c, err)
	}

	h.broadcastToServer(c, serverID, ws.EventMemberRoleUpdate, fiber.Map{
		"server_id": serverID,
		"user_id":   targetUserID,
		"role_id":   roleID,
		"action":    "remove",
	})
	return c.JSON(fiber.Map{"message": "role removed"})
}

func (h *RoleHandler) GetChannelOverrides(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	overrides, err := h.roleSvc.GetChannelOverrides(c.Context(), channelID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get overrides"})
	}

	return c.JSON(overrides)
}

func (h *RoleHandler) SetChannelOverride(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	roleID, err := uuid.Parse(c.Params("roleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role ID"})
	}

	var body struct {
		Allow string `json:"allow"`
		Deny  string `json:"deny"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	allow := parsePermissions(body.Allow)
	deny := parsePermissions(body.Deny)

	userID := auth.GetUserID(c)
	override, err := h.roleSvc.SetChannelOverride(c.Context(), serverID, channelID, roleID, userID, allow, deny)
	if err != nil {
		return handleRoleError(c, err)
	}

	return c.JSON(override)
}

func (h *RoleHandler) DeleteChannelOverride(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	roleID, err := uuid.Parse(c.Params("roleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.roleSvc.DeleteChannelOverride(c.Context(), serverID, channelID, roleID, userID); err != nil {
		return handleRoleError(c, err)
	}

	return c.JSON(fiber.Map{"message": "override deleted"})
}

func (h *RoleHandler) GetMembersWithRoles(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	members, err := h.roleSvc.GetMembersWithRoles(c.Context(), serverID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get members"})
	}

	return c.JSON(members)
}

func (h *RoleHandler) broadcastToServer(c fiber.Ctx, serverID uuid.UUID, eventType string, data any) {
	memberIDs, err := h.serverSvc.GetServerMemberUserIDs(c.Context(), serverID)
	if err != nil {
		log.Printf("Failed to get member IDs for %s broadcast: %v", eventType, err)
		return
	}
	event, err := ws.NewEvent(eventType, data)
	if err != nil {
		log.Printf("Failed to create %s event: %v", eventType, err)
		return
	}
	ws.BroadcastToServerMembers(h.hub, memberIDs, event, nil)
}

func parsePermissions(s string) int64 {
	if s == "" {
		return 0
	}
	var v int64
	for _, ch := range s {
		if ch >= '0' && ch <= '9' {
			v = v*10 + int64(ch-'0')
		}
	}
	return v
}

func handleRoleError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrRoleNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrCannotDeleteEveryone):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrCannotModifyHigherRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidRoleName):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
