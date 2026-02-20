package handler

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/ws"
)

type UserHandler struct {
	userService   *service.UserService
	hub           *ws.Hub
	coMemberIDsFn ws.CoMemberIDsFn
	uploadDir     string
}

func NewUserHandler(us *service.UserService, hub *ws.Hub, coMemberIDsFn ws.CoMemberIDsFn, uploadDir string) *UserHandler {
	return &UserHandler{userService: us, hub: hub, coMemberIDsFn: coMemberIDsFn, uploadDir: uploadDir}
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

	// Ensure upload directory exists
	if err := os.MkdirAll(h.uploadDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create upload directory"})
	}

	filename := fmt.Sprintf("%s%s", userID.String(), ext)
	destPath := filepath.Join(h.uploadDir, filename)

	// Remove any existing avatar with different extension
	matches, _ := filepath.Glob(filepath.Join(h.uploadDir, userID.String()+".*"))
	for _, m := range matches {
		os.Remove(m)
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read upload"})
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save file"})
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save file"})
	}

	avatarURL := fmt.Sprintf("/uploads/avatars/%s", filename)
	user, err := h.userService.SetAvatarURL(c.Context(), userID, avatarURL)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update avatar"})
	}

	h.broadcastProfileUpdate(c, userID, user)
	return c.JSON(user)
}

func (h *UserHandler) DeleteAvatar(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	// Remove files
	matches, _ := filepath.Glob(filepath.Join(h.uploadDir, userID.String()+".*"))
	for _, m := range matches {
		os.Remove(m)
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

	return c.JSON(toPublicUser(user))
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
