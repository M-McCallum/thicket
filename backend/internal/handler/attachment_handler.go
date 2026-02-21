package handler

import (
	"fmt"
	"io"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/storage"
)

type AttachmentHandler struct {
	queries *models.Queries
	storage *storage.Client
}

func NewAttachmentHandler(q *models.Queries, sc *storage.Client) *AttachmentHandler {
	return &AttachmentHandler{queries: q, storage: sc}
}

// ServeAttachment streams a file from object storage to the client.
func (h *AttachmentHandler) ServeAttachment(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid attachment ID"})
	}

	att, err := h.queries.GetAttachmentByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "attachment not found"})
	}

	if att.IsExternal {
		return c.Redirect().Status(fiber.StatusFound).To(att.ObjectKey)
	}

	obj, err := h.storage.GetObject(c.Context(), att.ObjectKey)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to retrieve file"})
	}
	defer obj.Close()

	c.Set("Content-Type", att.ContentType)
	c.Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, att.OriginalFilename))
	c.Set("Cache-Control", "public, max-age=86400, immutable")

	return c.SendStream(io.NopCloser(obj))
}
