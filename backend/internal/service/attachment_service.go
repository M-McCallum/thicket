package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/storage"
)

var (
	ErrFileTooLarge    = errors.New("file exceeds 25MB limit")
	ErrTooManyFiles    = errors.New("max 10 files per message")
	ErrInvalidFileType = errors.New("unsupported file type")
)

var allowedContentTypes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true,
	"video/mp4": true, "video/webm": true,
	"application/pdf": true, "text/plain": true,
	"application/zip": true, "application/x-zip-compressed": true,
}

type AttachmentService struct {
	queries *models.Queries
	storage *storage.Client
}

func NewAttachmentService(q *models.Queries, sc *storage.Client) *AttachmentService {
	return &AttachmentService{queries: q, storage: sc}
}

type AttachmentInput struct {
	Reader           io.Reader
	Filename         string
	ContentType      string
	Size             int64
}

func (s *AttachmentService) CreateAttachments(ctx context.Context, messageID *uuid.UUID, dmMessageID *uuid.UUID, inputs []AttachmentInput) ([]models.Attachment, error) {
	if len(inputs) > 10 {
		return nil, ErrTooManyFiles
	}

	var attachments []models.Attachment
	for _, input := range inputs {
		if input.Size > 25<<20 {
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
		} else {
			// Proxy through backend so browsers don't need direct MinIO access
			attachments[i].URL = "/api/attachments/" + attachments[i].ID.String() + "/" + attachments[i].OriginalFilename
		}
	}
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
