package handler

import (
	"fmt"
	"log"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/storage"
	"github.com/M-McCallum/thicket/internal/ws"
)

type UserHandler struct {
	userService   *service.UserService
	hub           *ws.Hub
	coMemberIDsFn ws.CoMemberIDsFn
	storage       *storage.Client
}

func NewUserHandler(us *service.UserService, hub *ws.Hub, coMemberIDsFn ws.CoMemberIDsFn, sc *storage.Client) *UserHandler {
	return &UserHandler{userService: us, hub: hub, coMemberIDsFn: coMemberIDsFn, storage: sc}
}

// publicUser strips sensitive fields for public profile viewing.
type publicUser struct {
	ID                    uuid.UUID  `json:"id"`
	Username              string     `json:"username"`
	AvatarURL             *string    `json:"avatar_url"`
	DisplayName           *string    `json:"display_name"`
	Status                string     `json:"status"`
	Bio                   string     `json:"bio"`
	Pronouns              string     `json:"pronouns"`
	CustomStatusText      string     `json:"custom_status_text"`
	CustomStatusEmoji     string     `json:"custom_status_emoji"`
	CustomStatusExpiresAt *string    `json:"custom_status_expires_at"`
}

func toPublicUser(u models.User) publicUser {
	p := publicUser{
		ID:                u.ID,
		Username:          u.Username,
		AvatarURL:         u.AvatarURL,
		DisplayName:       u.DisplayName,
		Status:            u.Status,
		Bio:               u.Bio,
		Pronouns:          u.Pronouns,
		CustomStatusText:  u.CustomStatusText,
		CustomStatusEmoji: u.CustomStatusEmoji,
	}
	if u.CustomStatusExpiresAt != nil {
		s := u.CustomStatusExpiresAt.Format("2006-01-02T15:04:05Z07:00")
		p.CustomStatusExpiresAt = &s
	}
	return p
}

func (h *UserHandler) GetMyProfile(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	user, err := h.userService.GetProfile(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get profile"})
	}
	h.resolveAvatarURL(c, &user)
	return c.JSON(user)
}

func (h *UserHandler) UpdateProfile(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	var input service.UpdateProfileInput
	if err := c.Bind().JSON(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	user, err := h.userService.UpdateProfile(c.Context(), userID, input)
	if err != nil {
		return handleUserError(c, err)
	}

	h.resolveAvatarURL(c, &user)
	h.broadcastProfileUpdate(c, userID, user)
	return c.JSON(user)
}

func (h *UserHandler) UpdateStatus(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	var body struct {
		Status string `json:"status"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	dbStatus, err := h.userService.UpdateStatus(c.Context(), userID, body.Status)
	if err != nil {
		return handleUserError(c, err)
	}

	// Broadcast presence change to co-members
	coMemberIDs, _ := h.coMemberIDsFn(c.Context(), userID)
	username := auth.GetUsername(c)
	presenceEvent, _ := ws.NewEvent(ws.EventPresenceUpdBcast, ws.PresenceData{
		UserID:   userID.String(),
		Username: username,
		Status:   dbStatus,
	})
	if presenceEvent != nil {
		ws.BroadcastToServerMembers(h.hub, coMemberIDs, presenceEvent, nil)
	}

	return c.JSON(fiber.Map{"status": dbStatus})
}

func (h *UserHandler) UpdateCustomStatus(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	var input service.UpdateCustomStatusInput
	if err := c.Bind().JSON(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	user, err := h.userService.UpdateCustomStatus(c.Context(), userID, input)
	if err != nil {
		return handleUserError(c, err)
	}

	h.resolveAvatarURL(c, &user)
	h.broadcastProfileUpdate(c, userID, user)
	return c.JSON(user)
}

var allowedAvatarExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
}

func (h *UserHandler) UploadAvatar(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	file, err := c.FormFile("avatar")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "avatar file is required"})
	}

	if file.Size > 8<<20 { // 8MB
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file too large (max 8MB)"})
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedAvatarExts[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "unsupported file type (jpg, png, gif, webp only)"})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read upload"})
	}
	defer src.Close()

	objectKey := fmt.Sprintf("avatars/%s%s", userID.String(), ext)
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if err := h.storage.Upload(c.Context(), objectKey, contentType, src, file.Size); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to upload avatar"})
	}

	user, err := h.userService.SetAvatarURL(c.Context(), userID, objectKey)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update avatar"})
	}

	h.resolveAvatarURL(c, &user)
	h.broadcastProfileUpdate(c, userID, user)
	return c.JSON(user)
}

func (h *UserHandler) DeleteAvatar(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	// Get current avatar key to delete from storage
	currentUser, err := h.userService.GetProfile(c.Context(), userID)
	if err == nil && currentUser.AvatarURL != nil {
		_ = h.storage.Delete(c.Context(), *currentUser.AvatarURL)
	}

	user, err := h.userService.ClearAvatar(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete avatar"})
	}

	h.broadcastProfileUpdate(c, userID, user)
	return c.JSON(user)
}

func (h *UserHandler) GetPublicProfile(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	user, err := h.userService.GetProfile(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	h.resolveAvatarURL(c, &user)
	return c.JSON(toPublicUser(user))
}

// resolveAvatarURL converts a storage object key to a proxy URL.
func (h *UserHandler) resolveAvatarURL(_ fiber.Ctx, user *models.User) {
	if user.AvatarURL == nil || *user.AvatarURL == "" {
		return
	}
	// Skip if it's already an absolute URL or proxy path
	if strings.HasPrefix(*user.AvatarURL, "http") || strings.HasPrefix(*user.AvatarURL, "/api/") || strings.HasPrefix(*user.AvatarURL, "/uploads/") {
		return
	}
	proxyURL := "/api/files/" + *user.AvatarURL
	user.AvatarURL = &proxyURL
}

func (h *UserHandler) broadcastProfileUpdate(c fiber.Ctx, userID uuid.UUID, user models.User) {
	coMemberIDs, err := h.coMemberIDsFn(c.Context(), userID)
	if err != nil {
		log.Printf("Failed to get co-member IDs for profile broadcast: %v", err)
		return
	}
	event, err := ws.NewEvent(ws.EventUserProfileUpdate, toPublicUser(user))
	if err != nil {
		log.Printf("Failed to create profile update event: %v", err)
		return
	}
	ws.BroadcastToServerMembers(h.hub, coMemberIDs, event, nil)
}

func handleUserError(c fiber.Ctx, err error) error {
	switch err {
	case service.ErrInvalidDisplayName,
		service.ErrInvalidBio,
		service.ErrInvalidPronouns,
		service.ErrInvalidStatus,
		service.ErrInvalidCustomStatus:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case service.ErrUserNotFound:
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
