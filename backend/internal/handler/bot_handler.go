package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type BotHandler struct {
	botService *service.BotService
}

func NewBotHandler(bs *service.BotService) *BotHandler {
	return &BotHandler{botService: bs}
}

// CreateBot creates a new bot and returns the token once.
func (h *BotHandler) CreateBot(c fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	bot, token, err := h.botService.CreateBot(c.Context(), userID, body.Username)
	if err != nil {
		return handleBotError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"bot":   bot,
		"token": token,
	})
}

// ListBots lists all bots owned by the current user.
func (h *BotHandler) ListBots(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	bots, err := h.botService.ListBots(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
	return c.JSON(bots)
}

// DeleteBot deletes a bot by ID.
func (h *BotHandler) DeleteBot(c fiber.Ctx) error {
	botID, err := uuid.Parse(c.Params("botId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid bot ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.botService.DeleteBot(c.Context(), botID, userID); err != nil {
		return handleBotError(c, err)
	}

	return c.JSON(fiber.Map{"message": "bot deleted"})
}

// RegenerateToken regenerates a bot's token.
func (h *BotHandler) RegenerateToken(c fiber.Ctx) error {
	botID, err := uuid.Parse(c.Params("botId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid bot ID"})
	}

	userID := auth.GetUserID(c)
	token, err := h.botService.RegenerateToken(c.Context(), botID, userID)
	if err != nil {
		return handleBotError(c, err)
	}

	return c.JSON(fiber.Map{"token": token})
}

func handleBotError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrBotNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrBotNotOwner):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrBotNameTaken):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidBotName):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
