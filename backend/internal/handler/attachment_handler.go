package handler

import (
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/storage"
)

type AttachmentHandler struct {
	queries *models.Queries
	storage storage.ObjectStorage
}

func NewAttachmentHandler(q *models.Queries, sc storage.ObjectStorage) *AttachmentHandler {
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

	data, err := io.ReadAll(obj)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read file"})
	}

	c.Set("Content-Type", att.ContentType)
	c.Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, att.OriginalFilename))
	c.Set("Cache-Control", "public, max-age=86400, immutable")

	return c.Send(data)
}

// ServeFile serves avatars, emojis, and stickers by their object key path.
// Route: /api/files/:path+ where path is e.g. "avatars/uuid.png" or "emojis/uuid.png"
func (h *AttachmentHandler) ServeFile(c fiber.Ctx) error {
	objectKey := c.Params("+")
	if objectKey == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing file path"})
	}

	// Only allow known prefixes to prevent arbitrary object access
	allowed := false
	for _, prefix := range []string{"avatars/", "emojis/", "stickers/"} {
		if strings.HasPrefix(objectKey, prefix) {
			allowed = true
			break
		}
	}
	if !allowed {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied"})
	}

	obj, err := h.storage.GetObject(c.Context(), objectKey)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "file not found"})
	}
	defer obj.Close()

	data, err := io.ReadAll(obj)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read file"})
	}

	ct := mime.TypeByExtension(filepath.Ext(objectKey))
	if ct == "" {
		ct = "application/octet-stream"
	}
	c.Set("Content-Type", ct)
	c.Set("Cache-Control", "public, max-age=86400, immutable")

	return c.Send(data)
}
