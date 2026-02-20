package models

import (
	"context"

	"github.com/google/uuid"
)

type CreateStickerPackParams struct {
	Name        string
	Description *string
	ServerID    *uuid.UUID
	CreatorID   uuid.UUID
}

func (q *Queries) CreateStickerPack(ctx context.Context, arg CreateStickerPackParams) (StickerPack, error) {
	var p StickerPack
	err := q.db.QueryRow(ctx,
		`INSERT INTO sticker_packs (name, description, server_id, creator_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, description, server_id, creator_id, created_at`,
		arg.Name, arg.Description, arg.ServerID, arg.CreatorID,
	).Scan(&p.ID, &p.Name, &p.Description, &p.ServerID, &p.CreatorID, &p.CreatedAt)
	return p, err
}

func (q *Queries) GetStickerPacks(ctx context.Context, serverID *uuid.UUID) ([]StickerPack, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, name, description, server_id, creator_id, created_at
		FROM sticker_packs WHERE server_id IS NULL OR server_id = $1
		ORDER BY name`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var packs []StickerPack
	for rows.Next() {
		var p StickerPack
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.ServerID, &p.CreatorID, &p.CreatedAt); err != nil {
			return nil, err
		}
		packs = append(packs, p)
	}
	if packs == nil {
		packs = []StickerPack{}
	}
	return packs, rows.Err()
}

func (q *Queries) GetStickerPackByID(ctx context.Context, id uuid.UUID) (StickerPack, error) {
	var p StickerPack
	err := q.db.QueryRow(ctx,
		`SELECT id, name, description, server_id, creator_id, created_at
		FROM sticker_packs WHERE id = $1`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.ServerID, &p.CreatorID, &p.CreatedAt)
	return p, err
}

type CreateStickerParams struct {
	PackID    uuid.UUID
	Name      string
	ObjectKey string
}

func (q *Queries) CreateSticker(ctx context.Context, arg CreateStickerParams) (Sticker, error) {
	var s Sticker
	err := q.db.QueryRow(ctx,
		`INSERT INTO stickers (pack_id, name, object_key)
		VALUES ($1, $2, $3)
		RETURNING id, pack_id, name, object_key, created_at`,
		arg.PackID, arg.Name, arg.ObjectKey,
	).Scan(&s.ID, &s.PackID, &s.Name, &s.ObjectKey, &s.CreatedAt)
	return s, err
}

func (q *Queries) GetStickersByPackID(ctx context.Context, packID uuid.UUID) ([]Sticker, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, pack_id, name, object_key, created_at
		FROM stickers WHERE pack_id = $1 ORDER BY name`, packID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stickers []Sticker
	for rows.Next() {
		var s Sticker
		if err := rows.Scan(&s.ID, &s.PackID, &s.Name, &s.ObjectKey, &s.CreatedAt); err != nil {
			return nil, err
		}
		stickers = append(stickers, s)
	}
	if stickers == nil {
		stickers = []Sticker{}
	}
	return stickers, rows.Err()
}

func (q *Queries) GetStickerByID(ctx context.Context, id uuid.UUID) (Sticker, error) {
	var s Sticker
	err := q.db.QueryRow(ctx,
		`SELECT id, pack_id, name, object_key, created_at
		FROM stickers WHERE id = $1`, id,
	).Scan(&s.ID, &s.PackID, &s.Name, &s.ObjectKey, &s.CreatedAt)
	return s, err
}

func (q *Queries) DeleteSticker(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM stickers WHERE id = $1`, id)
	return err
}
