package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type StickerHandler struct {
	stickerService *service.StickerService
	serverService  *service.ServerService
}

func NewStickerHandler(ss *service.StickerService, serverSvc *service.ServerService) *StickerHandler {
	return &StickerHandler{stickerService: ss, serverService: serverSvc}
}

func (h *StickerHandler) GetPacks(c fiber.Ctx) error {
	var serverID *uuid.UUID
	if sid := c.Query("server_id"); sid != "" {
		id, err := uuid.Parse(sid)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
		}
		serverID = &id
	}

	packs, err := h.stickerService.GetPacks(c.Context(), serverID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get sticker packs"})
	}
	return c.JSON(packs)
}

func (h *StickerHandler) GetStickers(c fiber.Ctx) error {
	packID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pack ID"})
	}

	stickers, err := h.stickerService.GetStickers(c.Context(), packID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get stickers"})
	}
	return c.JSON(stickers)
}

func (h *StickerHandler) CreatePack(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}

	userID := auth.GetUserID(c)
	if _, err := h.serverService.GetServer(c.Context(), serverID, userID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not a member"})
	}

	var body struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	pack, err := h.stickerService.CreatePack(c.Context(), body.Name, body.Description, &serverID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create sticker pack"})
	}

	return c.Status(fiber.StatusCreated).JSON(pack)
}

func (h *StickerHandler) CreateSticker(c fiber.Ctx) error {
	packID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pack ID"})
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

	sticker, err := h.stickerService.CreateSticker(c.Context(), packID, name, file.Filename, file.Header.Get("Content-Type"), src, file.Size)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(sticker)
}

func (h *StickerHandler) DeletePack(c fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server ID"})
	}
	packID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pack ID"})
	}

	if err := h.stickerService.DeletePack(c.Context(), serverID, packID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StickerHandler) DeleteSticker(c fiber.Ctx) error {
	stickerID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid sticker ID"})
	}

	if err := h.stickerService.DeleteSticker(c.Context(), stickerID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "deleted"})
}
