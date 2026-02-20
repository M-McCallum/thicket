package handler

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/storage"
	"github.com/M-McCallum/thicket/internal/ws"
)

type MessageHandler struct {
	messageService    *service.MessageService
	attachmentService *service.AttachmentService
	hub               *ws.Hub
}

func NewMessageHandler(ms *service.MessageService, hub *ws.Hub, sc *storage.Client) *MessageHandler {
	return &MessageHandler{
		messageService:    ms,
		attachmentService: service.NewAttachmentService(ms.Queries(), sc),
		hub:               hub,
	}
}

func (h *MessageHandler) SendMessage(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	userID := auth.GetUserID(c)
	content := c.FormValue("content")
	msgType := c.FormValue("type", "text")

	// Parse file uploads
	form, _ := c.MultipartForm()
	var fileInputs []service.AttachmentInput
	if form != nil && form.File["files[]"] != nil {
		for _, fh := range form.File["files[]"] {
			f, err := fh.Open()
			if err != nil {
				continue
			}
			fileInputs = append(fileInputs, service.AttachmentInput{
				Reader:      f,
				Filename:    fh.Filename,
				ContentType: fh.Header.Get("Content-Type"),
				Size:        fh.Size,
			})
		}
	}

	// Also check for JSON body if no multipart
	if form == nil {
		var body struct {
			Content string `json:"content"`
			Type    string `json:"type"`
		}
		if err := c.Bind().JSON(&body); err == nil {
			content = body.Content
			if body.Type != "" {
				msgType = body.Type
			}
		}
	}

	// Allow empty content if files present
	if content == "" && len(fileInputs) == 0 && msgType == "text" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "message content or attachments required"})
	}

	msg, err := h.messageService.SendMessage(c.Context(), channelID, userID, content, msgType)
	if err != nil {
		// Close any open file handles
		for _, fi := range fileInputs {
			if closer, ok := fi.Reader.(interface{ Close() error }); ok {
				closer.Close()
			}
		}
		return handleMessageError(c, err)
	}

	// Upload attachments
	var attachments []fiber.Map
	if len(fileInputs) > 0 {
		atts, err := h.attachmentService.CreateAttachments(c.Context(), &msg.ID, nil, fileInputs)
		// Close file handles
		for _, fi := range fileInputs {
			if closer, ok := fi.Reader.(interface{ Close() error }); ok {
				closer.Close()
			}
		}
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to upload attachments"})
		}
		h.attachmentService.ResolveURLs(c.Context(), atts)
		for _, a := range atts {
			attachments = append(attachments, fiber.Map{
				"id":                a.ID,
				"filename":          a.Filename,
				"original_filename": a.OriginalFilename,
				"content_type":      a.ContentType,
				"size":              a.Size,
				"url":               a.URL,
				"is_external":       a.IsExternal,
			})
		}
	}

	// Broadcast via WebSocket
	event, _ := ws.NewEvent(ws.EventMessageCreate, fiber.Map{
		"id":          msg.ID,
		"channel_id":  msg.ChannelID,
		"author_id":   msg.AuthorID,
		"content":     msg.Content,
		"type":        msg.Type,
		"created_at":  msg.CreatedAt,
		"username":    auth.GetUsername(c),
		"attachments": attachments,
	})
	if event != nil {
		h.hub.BroadcastToChannel(channelID.String(), event, nil)
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func (h *MessageHandler) GetMessages(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	var before *time.Time
	if b := c.Query("before"); b != "" {
		t, err := time.Parse(time.RFC3339, b)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid before timestamp"})
		}
		before = &t
	}

	limitVal := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limitVal = parsed
		}
	}
	limit := int32(limitVal)
	userID := auth.GetUserID(c)

	messages, err := h.messageService.GetMessages(c.Context(), channelID, userID, before, limit)
	if err != nil {
		return handleMessageError(c, err)
	}

	// Attach attachments
	_ = h.attachmentService.AttachToMessages(c.Context(), messages)

	return c.JSON(messages)
}

func (h *MessageHandler) UpdateMessage(c fiber.Ctx) error {
	messageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	msg, err := h.messageService.UpdateMessage(c.Context(), messageID, userID, body.Content)
	if err != nil {
		return handleMessageError(c, err)
	}

	event, _ := ws.NewEvent(ws.EventMessageUpdate, msg)
	if event != nil {
		h.hub.BroadcastToChannel(msg.ChannelID.String(), event, nil)
	}

	return c.JSON(msg)
}

func (h *MessageHandler) DeleteMessage(c fiber.Ctx) error {
	messageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	// Fetch channel ID before deleting so we can broadcast
	channelID, err := h.messageService.GetMessageChannelID(c.Context(), messageID)
	if err != nil {
		return handleMessageError(c, err)
	}

	userID := auth.GetUserID(c)
	if err := h.messageService.DeleteMessage(c.Context(), messageID, userID); err != nil {
		return handleMessageError(c, err)
	}

	event, _ := ws.NewEvent(ws.EventMessageDelete, fiber.Map{
		"id":         messageID,
		"channel_id": channelID,
	})
	if event != nil {
		h.hub.BroadcastToChannel(channelID.String(), event, nil)
	}

	return c.JSON(fiber.Map{"message": "deleted"})
}

func handleMessageError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrChannelNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrMessageNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotAuthor):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyMessage):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
