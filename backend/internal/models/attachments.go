package models

import (
	"context"

	"github.com/google/uuid"
)

type CreateAttachmentParams struct {
	MessageID        *uuid.UUID
	DMMessageID      *uuid.UUID
	Filename         string
	OriginalFilename string
	ContentType      string
	Size             int64
	Width            *int
	Height           *int
	ObjectKey        string
	IsExternal       bool
}

func (q *Queries) CreateAttachment(ctx context.Context, arg CreateAttachmentParams) (Attachment, error) {
	var a Attachment
	err := q.db.QueryRow(ctx,
		`INSERT INTO attachments (message_id, dm_message_id, filename, original_filename, content_type, size, width, height, object_key, is_external)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, message_id, dm_message_id, filename, original_filename, content_type, size, width, height, object_key, is_external, created_at`,
		arg.MessageID, arg.DMMessageID, arg.Filename, arg.OriginalFilename,
		arg.ContentType, arg.Size, arg.Width, arg.Height, arg.ObjectKey, arg.IsExternal,
	).Scan(&a.ID, &a.MessageID, &a.DMMessageID, &a.Filename, &a.OriginalFilename,
		&a.ContentType, &a.Size, &a.Width, &a.Height, &a.ObjectKey, &a.IsExternal, &a.CreatedAt)
	return a, err
}

func (q *Queries) GetAttachmentsByMessageIDs(ctx context.Context, messageIDs []uuid.UUID) ([]Attachment, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, message_id, dm_message_id, filename, original_filename, content_type, size, width, height, object_key, is_external, created_at
		FROM attachments WHERE message_id = ANY($1) ORDER BY created_at`,
		messageIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var attachments []Attachment
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.ID, &a.MessageID, &a.DMMessageID, &a.Filename, &a.OriginalFilename,
			&a.ContentType, &a.Size, &a.Width, &a.Height, &a.ObjectKey, &a.IsExternal, &a.CreatedAt); err != nil {
			return nil, err
		}
		attachments = append(attachments, a)
	}
	if attachments == nil {
		attachments = []Attachment{}
	}
	return attachments, rows.Err()
}

func (q *Queries) GetAttachmentsByDMMessageIDs(ctx context.Context, messageIDs []uuid.UUID) ([]Attachment, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, message_id, dm_message_id, filename, original_filename, content_type, size, width, height, object_key, is_external, created_at
		FROM attachments WHERE dm_message_id = ANY($1) ORDER BY created_at`,
		messageIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var attachments []Attachment
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.ID, &a.MessageID, &a.DMMessageID, &a.Filename, &a.OriginalFilename,
			&a.ContentType, &a.Size, &a.Width, &a.Height, &a.ObjectKey, &a.IsExternal, &a.CreatedAt); err != nil {
			return nil, err
		}
		attachments = append(attachments, a)
	}
	if attachments == nil {
		attachments = []Attachment{}
	}
	return attachments, rows.Err()
}

func (q *Queries) GetAttachmentsByMessageID(ctx context.Context, messageID uuid.UUID) ([]Attachment, error) {
	return q.GetAttachmentsByMessageIDs(ctx, []uuid.UUID{messageID})
}
