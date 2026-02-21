package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
)

type ChannelFollowHandler struct {
	queries *models.Queries
	permSvc *service.PermissionService
}

func NewChannelFollowHandler(q *models.Queries, permSvc *service.PermissionService) *ChannelFollowHandler {
	return &ChannelFollowHandler{queries: q, permSvc: permSvc}
}

// FollowChannel creates a follow from an announcement channel to a target channel.
func (h *ChannelFollowHandler) FollowChannel(c fiber.Ctx) error {
	sourceChannelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var body struct {
		TargetChannelID string `json:"target_channel_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	targetChannelID, err := uuid.Parse(body.TargetChannelID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid target_channel_id"})
	}

	userID := auth.GetUserID(c)

	// Verify source channel is an announcement channel
	sourceChannel, err := h.queries.GetChannelByID(c.Context(), sourceChannelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "source channel not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
	if !sourceChannel.IsAnnouncement {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "source channel is not an announcement channel"})
	}

	// Verify target channel exists and is a text channel
	targetChannel, err := h.queries.GetChannelByID(c.Context(), targetChannelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "target channel not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
	if targetChannel.Type != "text" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "target must be a text channel"})
	}

	// Cannot follow yourself
	if sourceChannelID == targetChannelID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cannot follow a channel to itself"})
	}

	// Verify user has ManageChannels permission in the target server
	ok, err := h.permSvc.HasServerPermission(c.Context(), targetChannel.ServerID, userID, models.PermManageChannels)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member of the target server"})
	}
	if !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "missing ManageChannels permission in target server"})
	}

	// Also verify user is a member of the source server
	if _, err := h.queries.GetServerMember(c.Context(), sourceChannel.ServerID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member of the source server"})
	}

	follow, err := h.queries.CreateChannelFollow(c.Context(), models.CreateChannelFollowParams{
		SourceChannelID: sourceChannelID,
		TargetChannelID: targetChannelID,
		CreatedBy:       userID,
	})
	if err != nil {
		// Check for unique violation
		if err.Error() == "ERROR: duplicate key value violates unique constraint \"channel_follows_source_channel_id_target_channel_id_key\" (SQLSTATE 23505)" {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "this follow already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create follow"})
	}

	return c.Status(fiber.StatusCreated).JSON(follow)
}

// UnfollowChannel removes a channel follow.
func (h *ChannelFollowHandler) UnfollowChannel(c fiber.Ctx) error {
	followID, err := uuid.Parse(c.Params("followId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid follow ID"})
	}

	userID := auth.GetUserID(c)

	// Verify the follow exists and user has permission
	follow, err := h.queries.GetChannelFollowByID(c.Context(), followID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "follow not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	// User must have ManageChannels in either the source or target server
	sourceChannel, err := h.queries.GetChannelByID(c.Context(), follow.SourceChannelID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
	targetChannel, err := h.queries.GetChannelByID(c.Context(), follow.TargetChannelID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	okSource, _ := h.permSvc.HasServerPermission(c.Context(), sourceChannel.ServerID, userID, models.PermManageChannels)
	okTarget, _ := h.permSvc.HasServerPermission(c.Context(), targetChannel.ServerID, userID, models.PermManageChannels)

	if !okSource && !okTarget {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "missing ManageChannels permission"})
	}

	if err := h.queries.DeleteChannelFollow(c.Context(), followID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete follow"})
	}

	return c.JSON(fiber.Map{"message": "unfollowed"})
}

// GetFollowers returns all channels following this announcement channel.
func (h *ChannelFollowHandler) GetFollowers(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	userID := auth.GetUserID(c)

	// Verify user is a member of the channel's server
	channel, err := h.queries.GetChannelByID(c.Context(), channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "channel not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	if _, err := h.queries.GetServerMember(c.Context(), channel.ServerID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member of this server"})
	}

	follows, err := h.queries.GetChannelFollowers(c.Context(), channelID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(follows)
}
