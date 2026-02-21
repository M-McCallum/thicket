package handler

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type ForumHandler struct {
	forumService *service.ForumService
	hub          *ws.Hub
}

func NewForumHandler(fs *service.ForumService, hub *ws.Hub) *ForumHandler {
	return &ForumHandler{forumService: fs, hub: hub}
}

// --- Tags ---

func (h *ForumHandler) GetTags(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}
	userID := auth.GetUserID(c)

	tags, err := h.forumService.GetTags(c.Context(), channelID, userID)
	if err != nil {
		return handleForumError(c, err)
	}
	return c.JSON(tags)
}

func (h *ForumHandler) CreateTag(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}
	userID := auth.GetUserID(c)

	var body struct {
		Name      string `json:"name"`
		Color     string `json:"color"`
		Emoji     string `json:"emoji"`
		Position  int    `json:"position"`
		Moderated bool   `json:"moderated"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	tag, err := h.forumService.CreateTag(c.Context(), channelID, userID, body.Name, body.Color, body.Emoji, body.Position, body.Moderated)
	if err != nil {
		return handleForumError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(tag)
}

func (h *ForumHandler) UpdateTag(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}
	tagID, err := uuid.Parse(c.Params("tagId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tag ID"})
	}
	userID := auth.GetUserID(c)

	var body struct {
		Name      *string `json:"name"`
		Color     *string `json:"color"`
		Emoji     *string `json:"emoji"`
		Position  *int    `json:"position"`
		Moderated *bool   `json:"moderated"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	tag, err := h.forumService.UpdateTag(c.Context(), channelID, tagID, userID, models.UpdateForumTagParams{
		Name:      body.Name,
		Color:     body.Color,
		Emoji:     body.Emoji,
		Position:  body.Position,
		Moderated: body.Moderated,
	})
	if err != nil {
		return handleForumError(c, err)
	}

	return c.JSON(tag)
}

func (h *ForumHandler) DeleteTag(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}
	tagID, err := uuid.Parse(c.Params("tagId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tag ID"})
	}
	userID := auth.GetUserID(c)

	if err := h.forumService.DeleteTag(c.Context(), channelID, tagID, userID); err != nil {
		return handleForumError(c, err)
	}
	return c.JSON(fiber.Map{"message": "tag deleted"})
}

// --- Posts ---

func (h *ForumHandler) GetPosts(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}
	userID := auth.GetUserID(c)

	sortBy := c.Query("sort", "latest")
	limit := 25
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil {
			offset = parsed
		}
	}

	// Parse tag filter
	var tagIDs []uuid.UUID
	if tags := c.Query("tags"); tags != "" {
		for _, t := range splitTags(tags) {
			if id, err := uuid.Parse(t); err == nil {
				tagIDs = append(tagIDs, id)
			}
		}
	}

	posts, err := h.forumService.GetPosts(c.Context(), channelID, userID, sortBy, tagIDs, limit, offset)
	if err != nil {
		return handleForumError(c, err)
	}

	// Resolve avatar URLs
	for i := range posts {
		if posts[i].AuthorAvatarURL != nil {
			proxyURL := "/api/files/" + *posts[i].AuthorAvatarURL
			posts[i].AuthorAvatarURL = &proxyURL
		}
	}

	return c.JSON(posts)
}

func (h *ForumHandler) CreatePost(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}
	userID := auth.GetUserID(c)

	var body struct {
		Title   string   `json:"title"`
		Content string   `json:"content"`
		TagIDs  []string `json:"tag_ids"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var tagIDs []uuid.UUID
	for _, t := range body.TagIDs {
		if id, err := uuid.Parse(t); err == nil {
			tagIDs = append(tagIDs, id)
		}
	}

	post, err := h.forumService.CreatePost(c.Context(), channelID, userID, body.Title, body.Content, tagIDs)
	if err != nil {
		return handleForumError(c, err)
	}

	// Resolve avatar URL
	if post.AuthorAvatarURL != nil {
		proxyURL := "/api/files/" + *post.AuthorAvatarURL
		post.AuthorAvatarURL = &proxyURL
	}

	// Broadcast to channel
	event, _ := ws.NewEvent("FORUM_POST_CREATE", post)
	if event != nil {
		h.hub.BroadcastToChannel(channelID.String(), event, nil)
	}

	return c.Status(fiber.StatusCreated).JSON(post)
}

func (h *ForumHandler) GetPost(c fiber.Ctx) error {
	postID, err := uuid.Parse(c.Params("postId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid post ID"})
	}
	userID := auth.GetUserID(c)

	post, err := h.forumService.GetPost(c.Context(), postID, userID)
	if err != nil {
		return handleForumError(c, err)
	}

	if post.AuthorAvatarURL != nil {
		proxyURL := "/api/files/" + *post.AuthorAvatarURL
		post.AuthorAvatarURL = &proxyURL
	}

	return c.JSON(post)
}

func (h *ForumHandler) UpdatePostTags(c fiber.Ctx) error {
	postID, err := uuid.Parse(c.Params("postId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid post ID"})
	}
	userID := auth.GetUserID(c)

	var body struct {
		TagIDs []string `json:"tag_ids"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var tagIDs []uuid.UUID
	for _, t := range body.TagIDs {
		if id, err := uuid.Parse(t); err == nil {
			tagIDs = append(tagIDs, id)
		}
	}

	if err := h.forumService.UpdatePostTags(c.Context(), postID, userID, tagIDs); err != nil {
		return handleForumError(c, err)
	}

	return c.JSON(fiber.Map{"message": "tags updated"})
}

func (h *ForumHandler) PinPost(c fiber.Ctx) error {
	postID, err := uuid.Parse(c.Params("postId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid post ID"})
	}
	userID := auth.GetUserID(c)

	if err := h.forumService.PinPost(c.Context(), postID, userID, true); err != nil {
		return handleForumError(c, err)
	}

	// Broadcast
	channelID, _ := h.forumService.GetPostChannelID(c.Context(), postID)
	event, _ := ws.NewEvent("FORUM_POST_PIN", fiber.Map{"post_id": postID, "channel_id": channelID, "pinned": true})
	if event != nil {
		h.hub.BroadcastToChannel(channelID.String(), event, nil)
	}

	return c.JSON(fiber.Map{"message": "post pinned"})
}

func (h *ForumHandler) UnpinPost(c fiber.Ctx) error {
	postID, err := uuid.Parse(c.Params("postId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid post ID"})
	}
	userID := auth.GetUserID(c)

	if err := h.forumService.PinPost(c.Context(), postID, userID, false); err != nil {
		return handleForumError(c, err)
	}

	channelID, _ := h.forumService.GetPostChannelID(c.Context(), postID)
	event, _ := ws.NewEvent("FORUM_POST_PIN", fiber.Map{"post_id": postID, "channel_id": channelID, "pinned": false})
	if event != nil {
		h.hub.BroadcastToChannel(channelID.String(), event, nil)
	}

	return c.JSON(fiber.Map{"message": "post unpinned"})
}

// --- Post Messages ---

func (h *ForumHandler) GetPostMessages(c fiber.Ctx) error {
	postID, err := uuid.Parse(c.Params("postId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid post ID"})
	}
	userID := auth.GetUserID(c)

	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil {
			offset = parsed
		}
	}

	messages, err := h.forumService.GetPostMessages(c.Context(), postID, userID, limit, offset)
	if err != nil {
		return handleForumError(c, err)
	}

	// Resolve avatar URLs
	for i := range messages {
		if messages[i].AuthorAvatarURL != nil {
			proxyURL := "/api/files/" + *messages[i].AuthorAvatarURL
			messages[i].AuthorAvatarURL = &proxyURL
		}
	}

	return c.JSON(messages)
}

func (h *ForumHandler) CreatePostMessage(c fiber.Ctx) error {
	postID, err := uuid.Parse(c.Params("postId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid post ID"})
	}
	userID := auth.GetUserID(c)

	var body struct {
		Content string `json:"content"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	msg, err := h.forumService.CreatePostMessage(c.Context(), postID, userID, body.Content)
	if err != nil {
		return handleForumError(c, err)
	}

	if msg.AuthorAvatarURL != nil {
		proxyURL := "/api/files/" + *msg.AuthorAvatarURL
		msg.AuthorAvatarURL = &proxyURL
	}

	// Broadcast to channel subscribers
	channelID, _ := h.forumService.GetPostChannelID(c.Context(), postID)
	event, _ := ws.NewEvent("FORUM_POST_MESSAGE_CREATE", fiber.Map{
		"post_id":    postID,
		"channel_id": channelID,
		"message":    msg,
	})
	if event != nil {
		h.hub.BroadcastToChannel(channelID.String(), event, nil)
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

// --- Helpers ---

func splitTags(s string) []string {
	var result []string
	current := ""
	for _, ch := range s {
		if ch == ',' {
			if current != "" {
				result = append(result, current)
				current = ""
			}
		} else {
			current += string(ch)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

func handleForumError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrNotMember):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrChannelNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotForumChannel):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrForumPostNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrForumTagNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyTitle):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyMessage):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrEmptyTagName):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInsufficientRole):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
