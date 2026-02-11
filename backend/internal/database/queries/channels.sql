-- name: CreateChannel :one
INSERT INTO channels (server_id, name, type, position)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetChannelByID :one
SELECT * FROM channels WHERE id = $1;

-- name: GetServerChannels :many
SELECT * FROM channels WHERE server_id = $1 ORDER BY position, name;

-- name: UpdateChannel :one
UPDATE channels
SET name = COALESCE($2, name),
    position = COALESCE($3, position),
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteChannel :exec
DELETE FROM channels WHERE id = $1;
