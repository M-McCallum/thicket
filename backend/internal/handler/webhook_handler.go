package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type WebhookHandler struct {
	webhookService *service.WebhookService
	hub            *ws.Hub
}

func NewWebhookHandler(ws *service.WebhookService, hub *ws.Hub) *WebhookHandler {
	return &WebhookHandler{webhookService: ws, hub: hub}
}

// CreateWebhook creates a webhook for a channel.
func (h *WebhookHandler) CreateWebhook(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var body struct {
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	webhook, token, err := h.webhookService.CreateWebhook(c.Context(), channelID, userID, body.Name)
	if err != nil {
		return handleWebhookError(c, err)
	}

	// Return the webhook with the plaintext token visible (shown once on creation only)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":         webhook.ID,
		"channel_id": webhook.ChannelID,
		"name":       webhook.Name,
		"avatar_url": webhook.AvatarURL,
		"token":      token,
		"creator_id": webhook.CreatorID,
		"created_at": webhook.CreatedAt,
		"url":        "/api/webhooks/" + webhook.ID.String() + "/" + token,
	})
}

// ListWebhooks lists all webhooks for a channel.
func (h *WebhookHandler) ListWebhooks(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	userID := auth.GetUserID(c)
	webhooks, err := h.webhookService.ListWebhooks(c.Context(), channelID, userID)
	if err != nil {
		return handleWebhookError(c, err)
	}

	return c.JSON(webhooks)
}

// DeleteWebhook deletes a webhook by ID.
func (h *WebhookHandler) DeleteWebhook(c fiber.Ctx) error {
	webhookID, err := uuid.Parse(c.Params("webhookId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid webhook ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.webhookService.DeleteWebhook(c.Context(), webhookID, userID); err != nil {
		return handleWebhookError(c, err)
	}

	return c.JSON(fiber.Map{"message": "webhook deleted"})
}

// ExecuteWebhook executes a webhook (public endpoint, no auth required).
func (h *WebhookHandler) ExecuteWebhook(c fiber.Ctx) error {
	webhookID, err := uuid.Parse(c.Params("webhookId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid webhook ID"})
	}
	token := c.Params("token")
	if token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing token"})
	}

	var body struct {
		Content   string `json:"content"`
		Username  string `json:"username"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if len(body.Content) > 4000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "content must be 4000 characters or fewer"})
	}
	if len(body.Username) > 80 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "username must be 80 characters or fewer"})
	}
	if len(body.AvatarURL) > 2048 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "avatar_url must be 2048 characters or fewer"})
	}

	webhook, msg, err := h.webhookService.ExecuteWebhook(c.Context(), webhookID, token, body.Content)
	if err != nil {
		return handleWebhookError(c, err)
	}

	// Determine display name and avatar for the broadcast
	displayName := webhook.Name
	if body.Username != "" {
		displayName = body.Username
	}
	avatarURL := webhook.AvatarURL
	if body.AvatarURL != "" {
		avatarURL = body.AvatarURL
	}

	// Broadcast via WebSocket like a normal message
	event, _ := ws.NewEvent(ws.EventMessageCreate, fiber.Map{
		"id":                  msg.ID,
		"channel_id":          msg.ChannelID,
		"author_id":           msg.AuthorID,
		"content":             msg.Content,
		"type":                msg.Type,
		"created_at":          msg.CreatedAt,
		"username":            displayName,
		"author_avatar_url":   avatarURL,
		"author_display_name": displayName,
		"webhook_id":          webhook.ID,
	})
	if event != nil {
		h.hub.BroadcastToChannel(msg.ChannelID.String(), event, nil)
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func handleWebhookError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrWebhookNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrWebhookTokenInvalid):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidWebhookName):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrChannelNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyMessage):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
