package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/storage"
)

const (
	MaxFileSizeBytes   = 500 << 20 // 500 MB
	LargeFileThreshold = 10 << 20  // 10 MB
	ChunkSize          = 10 << 20  // 10 MB per part
)

var (
	ErrFileTooLarge    = errors.New("file exceeds 500MB limit")
	ErrTooManyFiles    = errors.New("max 10 files per message")
	ErrInvalidFileType = errors.New("unsupported file type")
	ErrUploadExpired   = errors.New("upload has expired")
	ErrUploadNotFound  = errors.New("pending upload not found")
	ErrSizeMismatch    = errors.New("uploaded file size does not match declared size")
)

var allowedContentTypes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true,
	"video/mp4": true, "video/webm": true, "video/quicktime": true,
	"audio/mpeg": true, "audio/flac": true, "audio/wav": true,
	"application/pdf": true, "text/plain": true,
	"application/zip": true, "application/x-zip-compressed": true,
	"application/x-7z-compressed": true, "application/x-tar": true, "application/gzip": true,
	"application/octet-stream": true,
}

type AttachmentService struct {
	queries *models.Queries
	storage storage.ObjectStorage
}

func NewAttachmentService(q *models.Queries, sc storage.ObjectStorage) *AttachmentService {
	return &AttachmentService{queries: q, storage: sc}
}

type AttachmentInput struct {
	Reader      io.Reader
	Filename    string
	ContentType string
	Size        int64
}

func (s *AttachmentService) CreateAttachments(ctx context.Context, messageID *uuid.UUID, dmMessageID *uuid.UUID, inputs []AttachmentInput) ([]models.Attachment, error) {
	if len(inputs) > 10 {
		return nil, ErrTooManyFiles
	}

	var attachments []models.Attachment
	for _, input := range inputs {
		if input.Size > MaxFileSizeBytes {
			return nil, ErrFileTooLarge
		}
		if !allowedContentTypes[input.ContentType] {
			return nil, ErrInvalidFileType
		}

		ext := filepath.Ext(input.Filename)
		objectKey := fmt.Sprintf("attachments/%s%s", uuid.New().String(), ext)

		if err := s.storage.Upload(ctx, objectKey, input.ContentType, input.Reader, input.Size); err != nil {
			return nil, fmt.Errorf("upload attachment: %w", err)
		}

		a, err := s.queries.CreateAttachment(ctx, models.CreateAttachmentParams{
			MessageID:        messageID,
			DMMessageID:      dmMessageID,
			Filename:         filepath.Base(objectKey),
			OriginalFilename: input.Filename,
			ContentType:      input.ContentType,
			Size:             input.Size,
			ObjectKey:        objectKey,
			IsExternal:       false,
		})
		if err != nil {
			return nil, err
		}
		attachments = append(attachments, a)
	}
	return attachments, nil
}

func (s *AttachmentService) CreateExternalAttachment(ctx context.Context, messageID *uuid.UUID, dmMessageID *uuid.UUID, url, filename, contentType string) (models.Attachment, error) {
	return s.queries.CreateAttachment(ctx, models.CreateAttachmentParams{
		MessageID:        messageID,
		DMMessageID:      dmMessageID,
		Filename:         filename,
		OriginalFilename: filename,
		ContentType:      contentType,
		Size:             0,
		ObjectKey:        url,
		IsExternal:       true,
	})
}

func (s *AttachmentService) ResolveURLs(ctx context.Context, attachments []models.Attachment) {
	for i := range attachments {
		if attachments[i].IsExternal {
			attachments[i].URL = attachments[i].ObjectKey
		} else if attachments[i].Size >= LargeFileThreshold {
			// Large files: presigned URL direct from MinIO
			url, err := s.storage.GetPresignedURL(ctx, attachments[i].ObjectKey)
			if err == nil {
				attachments[i].URL = url
			} else {
				// Fallback to proxied URL
				attachments[i].URL = "/api/attachments/" + attachments[i].ID.String() + "/" + attachments[i].OriginalFilename
			}
		} else {
			// Small files: proxy through backend
			attachments[i].URL = "/api/attachments/" + attachments[i].ID.String() + "/" + attachments[i].OriginalFilename
		}
	}
}

// InitiateMultipartUpload starts a multipart upload for a large file and returns
// the pending upload ID, presigned part URLs, and the part size.
func (s *AttachmentService) InitiateMultipartUpload(ctx context.Context, userID uuid.UUID, filename, contentType string, fileSize int64) (uuid.UUID, []string, int64, error) {
	if fileSize > MaxFileSizeBytes {
		return uuid.Nil, nil, 0, ErrFileTooLarge
	}
	if !allowedContentTypes[contentType] {
		return uuid.Nil, nil, 0, ErrInvalidFileType
	}

	partCount := int(math.Ceil(float64(fileSize) / float64(ChunkSize)))
	if partCount < 1 {
		partCount = 1
	}

	ext := filepath.Ext(filename)
	objectKey := fmt.Sprintf("attachments/%s%s", uuid.New().String(), ext)

	uploadID, err := s.storage.NewMultipartUpload(ctx, objectKey, contentType)
	if err != nil {
		return uuid.Nil, nil, 0, fmt.Errorf("new multipart upload: %w", err)
	}

	partURLs := make([]string, partCount)
	for i := 0; i < partCount; i++ {
		url, err := s.storage.PresignedUploadPartURL(ctx, objectKey, uploadID, i+1)
		if err != nil {
			// Best effort: abort the upload we just started
			_ = s.storage.AbortMultipartUpload(ctx, objectKey, uploadID)
			return uuid.Nil, nil, 0, fmt.Errorf("presign part %d: %w", i+1, err)
		}
		partURLs[i] = url
	}

	pending, err := s.queries.CreatePendingUpload(ctx, models.CreatePendingUploadParams{
		UserID:      userID,
		ObjectKey:   objectKey,
		UploadID:    uploadID,
		Filename:    filename,
		ContentType: contentType,
		FileSize:    fileSize,
	})
	if err != nil {
		_ = s.storage.AbortMultipartUpload(ctx, objectKey, uploadID)
		return uuid.Nil, nil, 0, fmt.Errorf("persist pending upload: %w", err)
	}

	return pending.ID, partURLs, ChunkSize, nil
}

type CompletedPart struct {
	PartNumber int    `json:"part_number"`
	ETag       string `json:"etag"`
}

// ReportPartComplete records a completed part for a pending upload.
func (s *AttachmentService) ReportPartComplete(ctx context.Context, userID, pendingUploadID uuid.UUID, partNumber int, etag string) error {
	pending, err := s.queries.GetPendingUpload(ctx, pendingUploadID, userID)
	if err != nil {
		return ErrUploadNotFound
	}

	var parts []CompletedPart
	if err := json.Unmarshal(pending.PartsJSON, &parts); err != nil {
		parts = []CompletedPart{}
	}

	// Update or append the part
	found := false
	for i, p := range parts {
		if p.PartNumber == partNumber {
			parts[i].ETag = etag
			found = true
			break
		}
	}
	if !found {
		parts = append(parts, CompletedPart{PartNumber: partNumber, ETag: etag})
	}

	partsJSON, err := json.Marshal(parts)
	if err != nil {
		return fmt.Errorf("marshal parts: %w", err)
	}

	return s.queries.UpdatePendingUploadParts(ctx, pendingUploadID, partsJSON)
}

// FinalizeMultipartUpload completes the multipart upload, verifies the size,
// creates the attachment record, and cleans up the pending upload.
func (s *AttachmentService) FinalizeMultipartUpload(ctx context.Context, userID, pendingUploadID uuid.UUID, messageID *uuid.UUID, dmMessageID *uuid.UUID) (models.Attachment, error) {
	pending, err := s.queries.GetPendingUpload(ctx, pendingUploadID, userID)
	if err != nil {
		return models.Attachment{}, ErrUploadNotFound
	}

	if time.Now().After(pending.ExpiresAt) {
		return models.Attachment{}, ErrUploadExpired
	}

	var parts []CompletedPart
	if err := json.Unmarshal(pending.PartsJSON, &parts); err != nil {
		return models.Attachment{}, fmt.Errorf("unmarshal parts: %w", err)
	}

	// Convert to minio CompleteParts
	minioParts := make([]minio.CompletePart, len(parts))
	for i, p := range parts {
		minioParts[i] = minio.CompletePart{
			PartNumber: p.PartNumber,
			ETag:       p.ETag,
		}
	}

	if err := s.storage.CompleteMultipartUpload(ctx, pending.ObjectKey, pending.UploadID, minioParts); err != nil {
		return models.Attachment{}, fmt.Errorf("complete multipart upload: %w", err)
	}

	// Verify actual size matches declared size
	info, err := s.storage.StatObject(ctx, pending.ObjectKey)
	if err != nil {
		return models.Attachment{}, fmt.Errorf("stat object: %w", err)
	}
	if info.Size != pending.FileSize {
		// Size mismatch — abort and clean up
		_ = s.storage.Delete(ctx, pending.ObjectKey)
		_ = s.queries.DeletePendingUpload(ctx, pendingUploadID)
		return models.Attachment{}, ErrSizeMismatch
	}

	a, err := s.queries.CreateAttachment(ctx, models.CreateAttachmentParams{
		MessageID:        messageID,
		DMMessageID:      dmMessageID,
		Filename:         filepath.Base(pending.ObjectKey),
		OriginalFilename: pending.Filename,
		ContentType:      pending.ContentType,
		Size:             pending.FileSize,
		ObjectKey:        pending.ObjectKey,
		IsExternal:       false,
	})
	if err != nil {
		return models.Attachment{}, fmt.Errorf("create attachment: %w", err)
	}

	_ = s.queries.DeletePendingUpload(ctx, pendingUploadID)

	return a, nil
}

// AbortMultipartUpload cancels a pending multipart upload.
func (s *AttachmentService) AbortMultipartUpload(ctx context.Context, userID, pendingUploadID uuid.UUID) error {
	pending, err := s.queries.GetPendingUpload(ctx, pendingUploadID, userID)
	if err != nil {
		return ErrUploadNotFound
	}

	_ = s.storage.AbortMultipartUpload(ctx, pending.ObjectKey, pending.UploadID)
	return s.queries.DeletePendingUpload(ctx, pendingUploadID)
}

func (s *AttachmentService) AttachToMessages(ctx context.Context, messages []models.MessageWithAuthor) error {
	if len(messages) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(messages))
	for i, m := range messages {
		ids[i] = m.ID
	}

	attachments, err := s.queries.GetAttachmentsByMessageIDs(ctx, ids)
	if err != nil {
		return err
	}
	s.ResolveURLs(ctx, attachments)

	byMsg := make(map[uuid.UUID][]models.Attachment)
	for _, a := range attachments {
		if a.MessageID != nil {
			byMsg[*a.MessageID] = append(byMsg[*a.MessageID], a)
		}
	}
	for i := range messages {
		if atts, ok := byMsg[messages[i].ID]; ok {
			messages[i].Attachments = atts
		}
	}
	return nil
}

func (s *AttachmentService) AttachToDMMessages(ctx context.Context, messages []models.DMMessageWithAuthor) error {
	if len(messages) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(messages))
	for i, m := range messages {
		ids[i] = m.ID
	}

	attachments, err := s.queries.GetAttachmentsByDMMessageIDs(ctx, ids)
	if err != nil {
		return err
	}
	s.ResolveURLs(ctx, attachments)

	byMsg := make(map[uuid.UUID][]models.Attachment)
	for _, a := range attachments {
		if a.DMMessageID != nil {
			byMsg[*a.DMMessageID] = append(byMsg[*a.DMMessageID], a)
		}
	}
	for i := range messages {
		if atts, ok := byMsg[messages[i].ID]; ok {
			messages[i].Attachments = atts
		}
	}
	return nil
}

func IsImageContentType(ct string) bool {
	return strings.HasPrefix(ct, "image/")
}
