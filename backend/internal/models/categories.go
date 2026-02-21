package models

import (
	"context"

	"github.com/google/uuid"
)

type CreateCategoryParams struct {
	ServerID uuid.UUID
	Name     string
	Position int32
}

func (q *Queries) CreateCategory(ctx context.Context, arg CreateCategoryParams) (ChannelCategory, error) {
	var cat ChannelCategory
	err := q.db.QueryRow(ctx,
		`INSERT INTO channel_categories (server_id, name, position)
		VALUES ($1, $2, $3)
		RETURNING id, server_id, name, position, created_at`,
		arg.ServerID, arg.Name, arg.Position,
	).Scan(&cat.ID, &cat.ServerID, &cat.Name, &cat.Position, &cat.CreatedAt)
	return cat, err
}

func (q *Queries) GetServerCategories(ctx context.Context, serverID uuid.UUID) ([]ChannelCategory, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, name, position, created_at
		FROM channel_categories WHERE server_id = $1 ORDER BY position, name`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []ChannelCategory
	for rows.Next() {
		var cat ChannelCategory
		if err := rows.Scan(&cat.ID, &cat.ServerID, &cat.Name, &cat.Position, &cat.CreatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	if categories == nil {
		categories = []ChannelCategory{}
	}
	return categories, rows.Err()
}

func (q *Queries) UpdateCategory(ctx context.Context, id uuid.UUID, name *string, position *int32) (ChannelCategory, error) {
	var cat ChannelCategory
	err := q.db.QueryRow(ctx,
		`UPDATE channel_categories SET name = COALESCE($2, name), position = COALESCE($3, position)
		WHERE id = $1
		RETURNING id, server_id, name, position, created_at`,
		id, name, position,
	).Scan(&cat.ID, &cat.ServerID, &cat.Name, &cat.Position, &cat.CreatedAt)
	return cat, err
}

func (q *Queries) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM channel_categories WHERE id = $1`, id)
	return err
}

func (q *Queries) GetCategoryByID(ctx context.Context, id uuid.UUID) (ChannelCategory, error) {
	var cat ChannelCategory
	err := q.db.QueryRow(ctx,
		`SELECT id, server_id, name, position, created_at
		FROM channel_categories WHERE id = $1`, id,
	).Scan(&cat.ID, &cat.ServerID, &cat.Name, &cat.Position, &cat.CreatedAt)
	return cat, err
}
