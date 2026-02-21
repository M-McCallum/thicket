package handler

import (
	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/service"
)

type LinkPreviewHandler struct {
	svc *service.LinkPreviewService
}

func NewLinkPreviewHandler(svc *service.LinkPreviewService) *LinkPreviewHandler {
	return &LinkPreviewHandler{svc: svc}
}

func (h *LinkPreviewHandler) GetLinkPreview(c fiber.Ctx) error {
	rawURL := c.Query("url")
	if rawURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "url parameter required"})
	}

	preview, err := h.svc.FetchPreview(c.Context(), rawURL)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(preview)
}
