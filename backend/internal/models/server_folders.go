package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type ServerFolder struct {
	ID        uuid.UUID   `json:"id"`
	UserID    uuid.UUID   `json:"user_id"`
	Name      string      `json:"name"`
	Color     string      `json:"color"`
	Position  int         `json:"position"`
	CreatedAt time.Time   `json:"created_at"`
	ServerIDs []uuid.UUID `json:"server_ids"`
}

type ServerFolderEntry struct {
	FolderID uuid.UUID `json:"folder_id"`
	ServerID uuid.UUID `json:"server_id"`
	Position int       `json:"position"`
}

func (q *Queries) CreateServerFolder(ctx context.Context, userID uuid.UUID, name, color string) (ServerFolder, error) {
	var f ServerFolder
	err := q.db.QueryRow(ctx,
		`INSERT INTO server_folders (user_id, name, color, position)
		VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM server_folders WHERE user_id = $1), 0))
		RETURNING id, user_id, name, color, position, created_at`,
		userID, name, color,
	).Scan(&f.ID, &f.UserID, &f.Name, &f.Color, &f.Position, &f.CreatedAt)
	if err != nil {
		return f, err
	}
	f.ServerIDs = []uuid.UUID{}
	return f, nil
}

func (q *Queries) GetUserServerFolders(ctx context.Context, userID uuid.UUID) ([]ServerFolder, error) {
	rows, err := q.db.Query(ctx,
		`SELECT f.id, f.user_id, f.name, f.color, f.position, f.created_at
		FROM server_folders f
		WHERE f.user_id = $1
		ORDER BY f.position ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []ServerFolder
	for rows.Next() {
		var f ServerFolder
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Color, &f.Position, &f.CreatedAt); err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(folders) == 0 {
		return []ServerFolder{}, nil
	}

	// Collect folder IDs and fetch all entries at once
	folderIDs := make([]uuid.UUID, len(folders))
	folderMap := make(map[uuid.UUID]int, len(folders))
	for i, f := range folders {
		folderIDs[i] = f.ID
		folderMap[f.ID] = i
		folders[i].ServerIDs = []uuid.UUID{}
	}

	entryRows, err := q.db.Query(ctx,
		`SELECT folder_id, server_id FROM server_folder_entries
		WHERE folder_id = ANY($1)
		ORDER BY position ASC`,
		folderIDs,
	)
	if err != nil {
		return nil, err
	}
	defer entryRows.Close()

	for entryRows.Next() {
		var folderID, serverID uuid.UUID
		if err := entryRows.Scan(&folderID, &serverID); err != nil {
			return nil, err
		}
		idx := folderMap[folderID]
		folders[idx].ServerIDs = append(folders[idx].ServerIDs, serverID)
	}
	if err := entryRows.Err(); err != nil {
		return nil, err
	}

	return folders, nil
}

func (q *Queries) UpdateServerFolder(ctx context.Context, folderID, userID uuid.UUID, name, color string, position int) (ServerFolder, error) {
	var f ServerFolder
	err := q.db.QueryRow(ctx,
		`UPDATE server_folders SET name = $1, color = $2, position = $3
		WHERE id = $4 AND user_id = $5
		RETURNING id, user_id, name, color, position, created_at`,
		name, color, position, folderID, userID,
	).Scan(&f.ID, &f.UserID, &f.Name, &f.Color, &f.Position, &f.CreatedAt)
	return f, err
}

func (q *Queries) DeleteServerFolder(ctx context.Context, folderID, userID uuid.UUID) (int64, error) {
	tag, err := q.db.Exec(ctx,
		`DELETE FROM server_folders WHERE id = $1 AND user_id = $2`,
		folderID, userID,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (q *Queries) AddServerToFolder(ctx context.Context, folderID, serverID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO server_folder_entries (folder_id, server_id, position)
		VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM server_folder_entries WHERE folder_id = $1), 0))
		ON CONFLICT (folder_id, server_id) DO NOTHING`,
		folderID, serverID,
	)
	return err
}

func (q *Queries) RemoveServerFromFolder(ctx context.Context, folderID, serverID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM server_folder_entries WHERE folder_id = $1 AND server_id = $2`,
		folderID, serverID,
	)
	return err
}

func (q *Queries) GetServerFolder(ctx context.Context, folderID uuid.UUID) (ServerFolder, error) {
	var f ServerFolder
	err := q.db.QueryRow(ctx,
		`SELECT id, user_id, name, color, position, created_at FROM server_folders WHERE id = $1`,
		folderID,
	).Scan(&f.ID, &f.UserID, &f.Name, &f.Color, &f.Position, &f.CreatedAt)
	return f, err
}
