package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type EmojiHandler struct {
	emojiService  *service.EmojiService
	serverService *service.ServerService
}

func NewEmojiHandler(es *service.EmojiService, ss *service.ServerService) *EmojiHandler {
	return &EmojiHandler{emojiService: es, serverService: ss}
}

func (h *EmojiHandler) GetServerEmojis(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	if _, err := h.serverService.GetServer(c.Context(), serverID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member"})
	}

	emojis, err := h.emojiService.GetServerEmojis(c.Context(), serverID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get emojis"})
	}
	return c.JSON(emojis)
}

func (h *EmojiHandler) CreateEmoji(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	if _, err := h.serverService.GetServer(c.Context(), serverID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member"})
	}

	name := c.FormValue("name")
	file, err := c.FormFile("image")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "image file required"})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read file"})
	}
	defer src.Close()

	emoji, err := h.emojiService.CreateEmoji(c.Context(), serverID, userID, name, file.Filename, file.Header.Get("Content-Type"), src, file.Size)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(emoji)
}

func (h *EmojiHandler) DeleteEmoji(c fiber.Ctx) error {
	emojiID, err := uuid.Parse(c.Params("emojiId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid emoji ID"})
	}

	if err := h.emojiService.DeleteEmoji(c.Context(), emojiID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "deleted"})
}
