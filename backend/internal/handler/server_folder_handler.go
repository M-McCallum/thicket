package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type ServerFolderHandler struct {
	service *service.ServerFolderService
}

func NewServerFolderHandler(s *service.ServerFolderService) *ServerFolderHandler {
	return &ServerFolderHandler{service: s}
}

func (h *ServerFolderHandler) ListFolders(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	folders, err := h.service.GetUserFolders(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get folders"})
	}
	return c.JSON(folders)
}

func (h *ServerFolderHandler) CreateFolder(c fiber.Ctx) error {
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	folder, err := h.service.CreateFolder(c.Context(), userID, body.Name, body.Color)
	if err != nil {
		if err == service.ErrFolderNameRequired {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create folder"})
	}
	return c.Status(fiber.StatusCreated).JSON(folder)
}

func (h *ServerFolderHandler) UpdateFolder(c fiber.Ctx) error {
	folderID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid folder id"})
	}

	var body struct {
		Name     *string `json:"name"`
		Color    *string `json:"color"`
		Position *int    `json:"position"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	folder, err := h.service.UpdateFolder(c.Context(), folderID, userID, body.Name, body.Color, body.Position)
	if err != nil {
		switch err {
		case service.ErrFolderNotFound:
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case service.ErrFolderForbidden:
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
		case service.ErrFolderNameRequired:
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update folder"})
		}
	}
	return c.JSON(folder)
}

func (h *ServerFolderHandler) DeleteFolder(c fiber.Ctx) error {
	folderID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid folder id"})
	}

	userID := auth.GetUserID(c)
	if err := h.service.DeleteFolder(c.Context(), folderID, userID); err != nil {
		if err == service.ErrFolderNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete folder"})
	}
	return c.JSON(fiber.Map{"message": "folder deleted"})
}

func (h *ServerFolderHandler) AddServerToFolder(c fiber.Ctx) error {
	folderID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid folder id"})
	}
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	userID := auth.GetUserID(c)
	if err := h.service.AddServerToFolder(c.Context(), folderID, serverID, userID); err != nil {
		switch err {
		case service.ErrFolderNotFound:
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case service.ErrFolderForbidden:
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to add server to folder"})
		}
	}
	return c.JSON(fiber.Map{"message": "server added to folder"})
}

func (h *ServerFolderHandler) RemoveServerFromFolder(c fiber.Ctx) error {
	folderID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid folder id"})
	}
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	userID := auth.GetUserID(c)
	if err := h.service.RemoveServerFromFolder(c.Context(), folderID, serverID, userID); err != nil {
		switch err {
		case service.ErrFolderNotFound:
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case service.ErrFolderForbidden:
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to remove server from folder"})
		}
	}
	return c.JSON(fiber.Map{"message": "server removed from folder"})
}
