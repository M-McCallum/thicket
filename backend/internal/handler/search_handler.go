package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type SearchHandler struct {
	searchService *service.SearchService
}

func NewSearchHandler(ss *service.SearchService) *SearchHandler {
	return &SearchHandler{searchService: ss}
}

func (h *SearchHandler) SearchMessages(c fiber.Ctx) error {
	query := c.Query("q")
	if query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query parameter 'q' is required"})
	}

	userID := auth.GetUserID(c)

	var channelID *uuid.UUID
	if cid := c.Query("channel_id"); cid != "" {
		parsed, err := uuid.Parse(cid)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel_id"})
		}
		channelID = &parsed
	}

	var serverID *uuid.UUID
	if sid := c.Query("server_id"); sid != "" {
		parsed, err := uuid.Parse(sid)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server_id"})
		}
		serverID = &parsed
	}

	var before *string
	if b := c.Query("before"); b != "" {
		before = &b
	}

	limitVal := 25
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limitVal = parsed
		}
	}

	results, err := h.searchService.SearchMessages(c.Context(), userID, query, channelID, serverID, before, int32(limitVal))
	if err != nil {
		return handleMessageError(c, err)
	}

	// Resolve avatar URLs
	resolveMessageAvatars(results)

	return c.JSON(results)
}

func (h *SearchHandler) SearchDMMessages(c fiber.Ctx) error {
	query := c.Query("q")
	if query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query parameter 'q' is required"})
	}

	userID := auth.GetUserID(c)

	var conversationID *uuid.UUID
	if cid := c.Query("conversation_id"); cid != "" {
		parsed, err := uuid.Parse(cid)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation_id"})
		}
		conversationID = &parsed
	}

	var before *string
	if b := c.Query("before"); b != "" {
		before = &b
	}

	limitVal := 25
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limitVal = parsed
		}
	}

	results, err := h.searchService.SearchDMMessages(c.Context(), userID, query, conversationID, before, int32(limitVal))
	if err != nil {
		return handleDMError(c, err)
	}

	// Resolve avatar URLs
	resolveDMMessageAvatars(results)

	return c.JSON(results)
}
