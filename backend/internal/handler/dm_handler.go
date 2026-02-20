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

type DMHandler struct {
	dmService         *service.DMService
	attachmentService *service.AttachmentService
	hub               *ws.Hub
}

func NewDMHandler(ds *service.DMService, hub *ws.Hub, sc *storage.Client) *DMHandler {
	return &DMHandler{
		dmService:         ds,
		attachmentService: service.NewAttachmentService(ds.Queries(), sc),
		hub:               hub,
	}
}

func (h *DMHandler) CreateConversation(c fiber.Ctx) error {
	var body struct {
		ParticipantID string `json:"participant_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	participantID, err := uuid.Parse(body.ParticipantID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid participant ID"})
	}

	userID := auth.GetUserID(c)
	conv, err := h.dmService.CreateConversation(c.Context(), userID, participantID)
	if err != nil {
		return handleDMError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(conv)
}

func (h *DMHandler) GetConversations(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	convos, err := h.dmService.GetConversations(c.Context(), userID)
	if err != nil {
		return handleDMError(c, err)
	}

	return c.JSON(convos)
}

func (h *DMHandler) GetDMMessages(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
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

	messages, err := h.dmService.GetDMMessages(c.Context(), conversationID, userID, before, limit)
	if err != nil {
		return handleDMError(c, err)
	}

	_ = h.attachmentService.AttachToDMMessages(c.Context(), messages)

	return c.JSON(messages)
}

func (h *DMHandler) SendDM(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
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

	if content == "" && len(fileInputs) == 0 && msgType == "text" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "message content or attachments required"})
	}

	msg, err := h.dmService.SendDM(c.Context(), conversationID, userID, content, msgType)
	if err != nil {
		for _, fi := range fileInputs {
			if closer, ok := fi.Reader.(interface{ Close() error }); ok {
				closer.Close()
			}
		}
		return handleDMError(c, err)
	}

	var attachments []fiber.Map
	if len(fileInputs) > 0 {
		atts, err := h.attachmentService.CreateAttachments(c.Context(), nil, &msg.ID, fileInputs)
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

	// Broadcast to all participants via SendToUser
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMMessageCreate, fiber.Map{
			"id":              msg.ID,
			"conversation_id": msg.ConversationID,
			"author_id":       msg.AuthorID,
			"content":         msg.Content,
			"type":            msg.Type,
			"created_at":      msg.CreatedAt,
			"username":        auth.GetUsername(c),
			"attachments":     attachments,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func handleDMError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrConversationNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotDMParticipant):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrCannotDMSelf):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyMessage):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
