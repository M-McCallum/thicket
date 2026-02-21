package handler

import (
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/storage"
)

type AttachmentHandler struct {
	queries *models.Queries
	storage storage.ObjectStorage
}

func NewAttachmentHandler(q *models.Queries, sc storage.ObjectStorage) *AttachmentHandler {
	return &AttachmentHandler{queries: q, storage: sc}
}

// ServeAttachment serves a file from object storage. Large files get a 307
// redirect to a presigned MinIO URL; small files are streamed via io.Copy.
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

	// Large files: redirect to presigned MinIO URL (zero backend bandwidth)
	if att.Size >= service.LargeFileThreshold {
		presignedURL, err := h.storage.GetPresignedURL(c.Context(), att.ObjectKey)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate download URL"})
		}
		return c.Redirect().Status(fiber.StatusTemporaryRedirect).To(presignedURL)
	}

	// Small files: stream via io.Copy
	obj, err := h.storage.GetObject(c.Context(), att.ObjectKey)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to retrieve file"})
	}
	defer obj.Close()

	info, err := obj.Stat()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to stat file"})
	}

	c.Set("Content-Type", att.ContentType)
	c.Set("Content-Length", strconv.FormatInt(info.Size, 10))
	c.Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, att.OriginalFilename))
	c.Set("Cache-Control", "public, max-age=86400, immutable")

	_, err = io.Copy(c.Response().BodyWriter(), obj)
	return err
}

// ServeFile serves avatars, emojis, and stickers by their object key path.
// These are always small so we stream them via io.Copy.
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

	info, err := obj.Stat()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to stat file"})
	}

	ct := mime.TypeByExtension(filepath.Ext(objectKey))
	if ct == "" {
		ct = "application/octet-stream"
	}
	c.Set("Content-Type", ct)
	c.Set("Content-Length", strconv.FormatInt(info.Size, 10))
	c.Set("Cache-Control", "public, max-age=86400, immutable")

	_, err = io.Copy(c.Response().BodyWriter(), obj)
	return err
}
