package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type UploadHandler struct {
	attachmentService *service.AttachmentService
}

func NewUploadHandler(as *service.AttachmentService) *UploadHandler {
	return &UploadHandler{attachmentService: as}
}

type initiateRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	FileSize    int64  `json:"file_size"`
}

// InitiateUpload starts a multipart upload and returns presigned part URLs.
func (h *UploadHandler) InitiateUpload(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	var req initiateRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Filename == "" || req.ContentType == "" || req.FileSize <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "filename, content_type, and file_size are required"})
	}

	pendingID, partURLs, partSize, err := h.attachmentService.InitiateMultipartUpload(
		c.Context(), userID, req.Filename, req.ContentType, req.FileSize,
	)
	if err != nil {
		if errors.Is(err, service.ErrFileTooLarge) || errors.Is(err, service.ErrInvalidFileType) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to initiate upload"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"pending_upload_id": pendingID.String(),
		"part_urls":         partURLs,
		"part_size":         partSize,
	})
}

type partCompleteRequest struct {
	PartNumber int    `json:"part_number"`
	ETag       string `json:"etag"`
}

// ReportPartComplete records a completed chunk for a pending upload.
func (h *UploadHandler) ReportPartComplete(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	pendingID, err := uuid.Parse(c.Params("pendingId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pending upload ID"})
	}

	var req partCompleteRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.PartNumber <= 0 || req.ETag == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "part_number and etag are required"})
	}

	if err := h.attachmentService.ReportPartComplete(c.Context(), userID, pendingID, req.PartNumber, req.ETag); err != nil {
		if errors.Is(err, service.ErrUploadNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "pending upload not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to report part"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

type completeRequest struct {
	MessageID   string `json:"message_id"`
	DMMessageID string `json:"dm_message_id"`
}

// CompleteUpload finalizes the multipart upload and creates the attachment.
func (h *UploadHandler) CompleteUpload(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	pendingID, err := uuid.Parse(c.Params("pendingId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pending upload ID"})
	}

	var req completeRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var messageID *uuid.UUID
	if req.MessageID != "" {
		id, err := uuid.Parse(req.MessageID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid message_id"})
		}
		messageID = &id
	}

	var dmMessageID *uuid.UUID
	if req.DMMessageID != "" {
		id, err := uuid.Parse(req.DMMessageID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid dm_message_id"})
		}
		dmMessageID = &id
	}

	att, err := h.attachmentService.FinalizeMultipartUpload(c.Context(), userID, pendingID, messageID, dmMessageID)
	if err != nil {
		if errors.Is(err, service.ErrUploadNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "pending upload not found"})
		}
		if errors.Is(err, service.ErrUploadExpired) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "upload has expired"})
		}
		if errors.Is(err, service.ErrSizeMismatch) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "uploaded file size does not match declared size"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to complete upload"})
	}

	return c.JSON(att)
}

// AbortUpload cancels a pending multipart upload.
func (h *UploadHandler) AbortUpload(c fiber.Ctx) error {
	userID := auth.GetUserID(c)

	pendingID, err := uuid.Parse(c.Params("pendingId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pending upload ID"})
	}

	if err := h.attachmentService.AbortMultipartUpload(c.Context(), userID, pendingID); err != nil {
		if errors.Is(err, service.ErrUploadNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "pending upload not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to abort upload"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
