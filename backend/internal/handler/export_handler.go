package handler

import (
	"fmt"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type ExportHandler struct {
	exportService *service.ExportService
}

func NewExportHandler(es *service.ExportService) *ExportHandler {
	return &ExportHandler{exportService: es}
}

// ExportChannelMessages exports all messages from a channel as JSON or HTML.
func (h *ExportHandler) ExportChannelMessages(c fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid channel ID"})
	}

	format := c.Query("format", "json")
	if format != "json" && format != "html" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "format must be json or html"})
	}

	userID := auth.GetUserID(c)

	data, channelName, err := h.exportService.ExportChannelMessages(c.Context(), channelID, userID, format)
	if err != nil {
		return handleExportError(c, err)
	}

	var contentType string
	var ext string
	switch format {
	case "html":
		contentType = "text/html; charset=utf-8"
		ext = "html"
	default:
		contentType = "application/json; charset=utf-8"
		ext = "json"
	}

	filename := fmt.Sprintf("%s-export.%s", channelName, ext)
	c.Set("Content-Type", contentType)
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	return c.Send(data)
}

// ExportAccountData exports the user's account data as JSON.
func (h *ExportHandler) ExportAccountData(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	data, err := h.exportService.ExportAccountData(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to export account data"})
	}

	c.Set("Content-Type", "application/json; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="account-data-export.json"`)
	return c.Send(data)
}

func handleExportError(c fiber.Ctx, err error) error {
	switch err {
	case service.ErrChannelNotFound:
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case service.ErrNotMember:
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
