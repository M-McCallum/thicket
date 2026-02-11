-- name: CreateMessage :one
INSERT INTO messages (channel_id, author_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetMessageByID :one
SELECT * FROM messages WHERE id = $1;

-- name: GetChannelMessages :many
SELECT m.*, u.username as author_username, u.display_name as author_display_name, u.avatar_url as author_avatar_url
FROM messages m
JOIN users u ON m.author_id = u.id
WHERE m.channel_id = $1
  AND ($2::timestamptz IS NULL OR m.created_at < $2)
ORDER BY m.created_at DESC
LIMIT $3;

-- name: UpdateMessage :one
UPDATE messages
SET content = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteMessage :exec
DELETE FROM messages WHERE id = $1;
