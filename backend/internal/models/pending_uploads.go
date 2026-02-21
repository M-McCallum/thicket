package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type PendingUpload struct {
	ID          uuid.UUID       `json:"id"`
	UserID      uuid.UUID       `json:"user_id"`
	ObjectKey   string          `json:"object_key"`
	UploadID    string          `json:"upload_id"`
	Filename    string          `json:"filename"`
	ContentType string          `json:"content_type"`
	FileSize    int64           `json:"file_size"`
	PartsJSON   json.RawMessage `json:"parts_json"`
	CreatedAt   time.Time       `json:"created_at"`
	ExpiresAt   time.Time       `json:"expires_at"`
}

type CreatePendingUploadParams struct {
	UserID      uuid.UUID
	ObjectKey   string
	UploadID    string
	Filename    string
	ContentType string
	FileSize    int64
}

func (q *Queries) CreatePendingUpload(ctx context.Context, arg CreatePendingUploadParams) (PendingUpload, error) {
	var p PendingUpload
	err := q.db.QueryRow(ctx,
		`INSERT INTO pending_uploads (user_id, object_key, upload_id, filename, content_type, file_size)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, user_id, object_key, upload_id, filename, content_type, file_size, parts_json, created_at, expires_at`,
		arg.UserID, arg.ObjectKey, arg.UploadID, arg.Filename, arg.ContentType, arg.FileSize,
	).Scan(&p.ID, &p.UserID, &p.ObjectKey, &p.UploadID, &p.Filename, &p.ContentType,
		&p.FileSize, &p.PartsJSON, &p.CreatedAt, &p.ExpiresAt)
	return p, err
}

func (q *Queries) GetPendingUpload(ctx context.Context, id, userID uuid.UUID) (PendingUpload, error) {
	var p PendingUpload
	err := q.db.QueryRow(ctx,
		`SELECT id, user_id, object_key, upload_id, filename, content_type, file_size, parts_json, created_at, expires_at
		FROM pending_uploads WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&p.ID, &p.UserID, &p.ObjectKey, &p.UploadID, &p.Filename, &p.ContentType,
		&p.FileSize, &p.PartsJSON, &p.CreatedAt, &p.ExpiresAt)
	return p, err
}

func (q *Queries) UpdatePendingUploadParts(ctx context.Context, id uuid.UUID, partsJSON json.RawMessage) error {
	_, err := q.db.Exec(ctx,
		`UPDATE pending_uploads SET parts_json = $1 WHERE id = $2`,
		partsJSON, id,
	)
	return err
}

func (q *Queries) DeletePendingUpload(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM pending_uploads WHERE id = $1`, id)
	return err
}

func (q *Queries) GetExpiredPendingUploads(ctx context.Context) ([]PendingUpload, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, user_id, object_key, upload_id, filename, content_type, file_size, parts_json, created_at, expires_at
		FROM pending_uploads WHERE expires_at < now()`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var uploads []PendingUpload
	for rows.Next() {
		var p PendingUpload
		if err := rows.Scan(&p.ID, &p.UserID, &p.ObjectKey, &p.UploadID, &p.Filename, &p.ContentType,
			&p.FileSize, &p.PartsJSON, &p.CreatedAt, &p.ExpiresAt); err != nil {
			return nil, err
		}
		uploads = append(uploads, p)
	}
	return uploads, rows.Err()
}

func (q *Queries) DeleteExpiredPendingUploads(ctx context.Context) (int64, error) {
	ct, err := q.db.Exec(ctx, `DELETE FROM pending_uploads WHERE expires_at < now()`)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}
