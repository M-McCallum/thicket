package handler

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
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
	resolveDMMessageAvatars(messages)

	return c.JSON(messages)
}

func resolveDMMessageAvatars(messages []models.DMMessageWithAuthor) {
	for i := range messages {
		if messages[i].AuthorAvatarURL != nil {
			proxyURL := "/api/files/" + *messages[i].AuthorAvatarURL
			messages[i].AuthorAvatarURL = &proxyURL
		}
	}
}

func (h *DMHandler) GetDMMessagesAround(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	tsStr := c.Query("timestamp")
	if tsStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "timestamp is required"})
	}
	ts, err := time.Parse(time.RFC3339Nano, tsStr)
	if err != nil {
		ts, err = time.Parse(time.RFC3339, tsStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid timestamp"})
		}
	}

	limitVal := 25
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limitVal = parsed
		}
	}
	limit := int32(limitVal)
	userID := auth.GetUserID(c)

	// Get messages before timestamp
	before, err := h.dmService.GetDMMessages(c.Context(), conversationID, userID, &ts, limit)
	if err != nil {
		return handleDMError(c, err)
	}

	// Get messages after timestamp
	after, err := h.dmService.GetDMMessagesAfter(c.Context(), conversationID, userID, ts, limit)
	if err != nil {
		return handleDMError(c, err)
	}

	// Reverse after (ASC) to DESC, then merge
	for i, j := 0, len(after)-1; i < j; i, j = i+1, j-1 {
		after[i], after[j] = after[j], after[i]
	}
	merged := append(after, before...)

	_ = h.attachmentService.AttachToDMMessages(c.Context(), merged)
	resolveDMMessageAvatars(merged)

	return c.JSON(merged)
}

func (h *DMHandler) SendDM(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	userID := auth.GetUserID(c)
	content := c.FormValue("content")
	msgType := c.FormValue("type", "text")
	replyToIDStr := c.FormValue("reply_to_id")

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
			Content   string  `json:"content"`
			Type      string  `json:"type"`
			ReplyToID *string `json:"reply_to_id"`
		}
		if err := c.Bind().JSON(&body); err == nil {
			content = body.Content
			if body.Type != "" {
				msgType = body.Type
			}
			if body.ReplyToID != nil {
				replyToIDStr = *body.ReplyToID
			}
		}
	}

	if content == "" && len(fileInputs) == 0 && msgType == "text" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "message content or attachments required"})
	}

	var replyToID *uuid.UUID
	if replyToIDStr != "" {
		parsed, err := uuid.Parse(replyToIDStr)
		if err == nil {
			replyToID = &parsed
		}
	}

	msg, err := h.dmService.SendDMWithOptions(c.Context(), conversationID, userID, content, service.SendDMOptions{
		MsgType:   msgType,
		ReplyToID: replyToID,
	})
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

	// Look up author for avatar/display_name
	var authorAvatarURL, authorDisplayName interface{}
	author, authorErr := h.dmService.Queries().GetUserByID(c.Context(), userID)
	if authorErr == nil {
		if author.AvatarURL != nil {
			proxyURL := "/api/files/" + *author.AvatarURL
			authorAvatarURL = proxyURL
		}
		authorDisplayName = author.DisplayName
	}

	// Broadcast to all participants via SendToUser
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		// Check if conversation is encrypted
		conv, _ := h.dmService.Queries().GetDMConversationByID(c.Context(), conversationID)
		event, _ := ws.NewEvent(ws.EventDMMessageCreate, fiber.Map{
			"id":                   msg.ID,
			"conversation_id":     msg.ConversationID,
			"author_id":           msg.AuthorID,
			"content":             msg.Content,
			"type":                msg.Type,
			"created_at":          msg.CreatedAt,
			"username":            auth.GetUsername(c),
			"author_avatar_url":   authorAvatarURL,
			"author_display_name": authorDisplayName,
			"attachments":         attachments,
			"encrypted":           conv.Encrypted,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func (h *DMHandler) AcceptRequest(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.dmService.AcceptMessageRequest(c.Context(), conversationID, userID); err != nil {
		return handleDMError(c, err)
	}

	return c.JSON(fiber.Map{"message": "message request accepted"})
}

func (h *DMHandler) DeclineRequest(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.dmService.DeclineMessageRequest(c.Context(), conversationID, userID); err != nil {
		return handleDMError(c, err)
	}

	return c.JSON(fiber.Map{"message": "message request declined"})
}

func (h *DMHandler) CreateGroupConversation(c fiber.Ctx) error {
	var body struct {
		ParticipantIDs []string `json:"participant_ids"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if len(body.ParticipantIDs) < 2 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "group DM requires at least 2 other participants"})
	}

	participantIDs := make([]uuid.UUID, 0, len(body.ParticipantIDs))
	for _, idStr := range body.ParticipantIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid participant ID: " + idStr})
		}
		participantIDs = append(participantIDs, id)
	}

	userID := auth.GetUserID(c)
	conv, err := h.dmService.CreateGroupConversation(c.Context(), userID, participantIDs)
	if err != nil {
		return handleDMError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(conv)
}

func (h *DMHandler) AddParticipant(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	var body struct {
		UserID string `json:"user_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	targetUserID, err := uuid.Parse(body.UserID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.dmService.AddParticipant(c.Context(), conversationID, targetUserID, userID); err != nil {
		return handleDMError(c, err)
	}

	// Broadcast to all participants (including the newly added one)
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMParticipantAdd, fiber.Map{
			"conversation_id": conversationID,
			"user_id":         targetUserID,
			"added_by":        userID,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "participant added"})
}

func (h *DMHandler) RemoveParticipant(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	targetUserID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	userID := auth.GetUserID(c)

	// Get participant IDs before removal for broadcasting
	participantIDs, _ := h.dmService.GetParticipantIDs(c.Context(), conversationID)

	if err := h.dmService.RemoveParticipant(c.Context(), conversationID, targetUserID, userID); err != nil {
		return handleDMError(c, err)
	}

	// Broadcast to all participants (including the removed one)
	if participantIDs != nil {
		event, _ := ws.NewEvent(ws.EventDMParticipantRemove, fiber.Map{
			"conversation_id": conversationID,
			"user_id":         targetUserID,
			"removed_by":      userID,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "participant removed"})
}

func (h *DMHandler) RenameConversation(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	if err := h.dmService.RenameConversation(c.Context(), conversationID, userID, body.Name); err != nil {
		return handleDMError(c, err)
	}

	// Broadcast to all participants
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMConversationUpdate, fiber.Map{
			"conversation_id": conversationID,
			"name":            body.Name,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "conversation renamed"})
}

func (h *DMHandler) EditDMMessage(c fiber.Ctx) error {
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
	msg, err := h.dmService.EditDMMessage(c.Context(), messageID, userID, body.Content)
	if err != nil {
		return handleDMError(c, err)
	}

	// Broadcast to all participants
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), msg.ConversationID)
	if err == nil {
		conv, _ := h.dmService.Queries().GetDMConversationByID(c.Context(), msg.ConversationID)
		event, _ := ws.NewEvent(ws.EventDMMessageUpdate, fiber.Map{
			"id":              msg.ID,
			"conversation_id": msg.ConversationID,
			"author_id":       msg.AuthorID,
			"content":         msg.Content,
			"created_at":      msg.CreatedAt,
			"updated_at":      msg.UpdatedAt,
			"encrypted":       conv.Encrypted,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(msg)
}

func (h *DMHandler) DeleteDMMessage(c fiber.Ctx) error {
	messageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	userID := auth.GetUserID(c)
	conversationID, err := h.dmService.DeleteDMMessage(c.Context(), messageID, userID)
	if err != nil {
		return handleDMError(c, err)
	}

	// Broadcast to all participants
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMMessageDelete, fiber.Map{
			"id":              messageID,
			"conversation_id": conversationID,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "message deleted"})
}

func (h *DMHandler) AddDMReaction(c fiber.Ctx) error {
	messageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	emoji := c.Query("emoji")
	if emoji == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "emoji is required"})
	}

	userID := auth.GetUserID(c)
	conversationID, err := h.dmService.AddDMReaction(c.Context(), messageID, userID, emoji)
	if err != nil {
		return handleDMError(c, err)
	}

	// Broadcast
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMReactionAdd, fiber.Map{
			"message_id":      messageID,
			"conversation_id": conversationID,
			"user_id":         userID,
			"emoji":           emoji,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "reaction added"})
}

func (h *DMHandler) RemoveDMReaction(c fiber.Ctx) error {
	messageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	emoji := c.Query("emoji")
	if emoji == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "emoji is required"})
	}

	userID := auth.GetUserID(c)
	conversationID, err := h.dmService.RemoveDMReaction(c.Context(), messageID, userID, emoji)
	if err != nil {
		return handleDMError(c, err)
	}

	// Broadcast
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMReactionRemove, fiber.Map{
			"message_id":      messageID,
			"conversation_id": conversationID,
			"user_id":         userID,
			"emoji":           emoji,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "reaction removed"})
}

func (h *DMHandler) GetDMEditHistory(c fiber.Ctx) error {
	messageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	userID := auth.GetUserID(c)
	edits, err := h.dmService.GetDMEditHistory(c.Context(), messageID, userID)
	if err != nil {
		return handleDMError(c, err)
	}

	return c.JSON(edits)
}

func (h *DMHandler) PinDMMessage(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	messageID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.dmService.PinDMMessage(c.Context(), conversationID, messageID, userID); err != nil {
		return handleDMError(c, err)
	}

	// Broadcast
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMMessagePin, fiber.Map{
			"conversation_id": conversationID,
			"message_id":      messageID,
			"pinned_by":       userID,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "message pinned"})
}

func (h *DMHandler) UnpinDMMessage(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	messageID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message ID"})
	}

	userID := auth.GetUserID(c)
	if err := h.dmService.UnpinDMMessage(c.Context(), conversationID, messageID, userID); err != nil {
		return handleDMError(c, err)
	}

	// Broadcast
	participantIDs, err := h.dmService.GetParticipantIDs(c.Context(), conversationID)
	if err == nil {
		event, _ := ws.NewEvent(ws.EventDMMessageUnpin, fiber.Map{
			"conversation_id": conversationID,
			"message_id":      messageID,
		})
		if event != nil {
			for _, pid := range participantIDs {
				h.hub.SendToUser(pid, event)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "message unpinned"})
}

func (h *DMHandler) GetDMPinnedMessages(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	userID := auth.GetUserID(c)
	messages, err := h.dmService.GetDMPinnedMessages(c.Context(), conversationID, userID)
	if err != nil {
		return handleDMError(c, err)
	}

	_ = h.attachmentService.AttachToDMMessages(c.Context(), messages)
	resolveDMMessageAvatars(messages)

	return c.JSON(messages)
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
	case errors.Is(err, service.ErrMessageTooLong):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrMaxParticipants):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrAlreadyParticipant):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotGroupConversation):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidGroupSize):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrDMMessageNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotDMMessageAuthor):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrConversationNotPending):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
