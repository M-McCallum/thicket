package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type SoundboardHandler struct {
	soundboardService *service.SoundboardService
	serverService     *service.ServerService
}

func NewSoundboardHandler(sbs *service.SoundboardService, ss *service.ServerService) *SoundboardHandler {
	return &SoundboardHandler{soundboardService: sbs, serverService: ss}
}

func (h *SoundboardHandler) GetSounds(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	if _, err := h.serverService.GetServer(c.Context(), serverID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member"})
	}

	sounds, err := h.soundboardService.GetSounds(c.Context(), serverID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get sounds"})
	}
	return c.JSON(sounds)
}

func (h *SoundboardHandler) CreateSound(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	if _, err := h.serverService.GetServer(c.Context(), serverID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member"})
	}

	name := c.FormValue("name")
	file, err := c.FormFile("sound")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "sound file required"})
	}

	durationMs := 0
	if d := c.FormValue("duration_ms"); d != "" {
		durationMs, _ = strconv.Atoi(d)
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read file"})
	}
	defer src.Close()

	sound, err := h.soundboardService.CreateSound(
		c.Context(), serverID, userID,
		name, file.Filename, file.Header.Get("Content-Type"),
		src, file.Size, durationMs,
	)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(sound)
}

func (h *SoundboardHandler) DeleteSound(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	soundID, err := uuid.Parse(c.Params("soundId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid sound ID"})
	}

	userID := auth.GetUserID(c)
	if _, err := h.serverService.GetServer(c.Context(), serverID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member"})
	}

	// Check if user is the creator or has manage server permission
	sound, err := h.soundboardService.GetSoundByID(c.Context(), soundID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "sound not found"})
	}

	if sound.CreatorID != userID {
		// Check if user has ManageServer permission (owner/admin)
		server, _ := h.serverService.GetServer(c.Context(), serverID, userID)
		if server == nil || server.OwnerID != userID {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you can only delete your own sounds"})
		}
	}

	if err := h.soundboardService.DeleteSound(c.Context(), soundID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "deleted"})
}
