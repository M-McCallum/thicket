-- name: CreateDMConversation :one
INSERT INTO dm_conversations (is_group, name)
VALUES ($1, $2)
RETURNING *;

-- name: AddDMParticipant :exec
INSERT INTO dm_participants (conversation_id, user_id)
VALUES ($1, $2);

-- name: GetDMParticipant :one
SELECT * FROM dm_participants WHERE conversation_id = $1 AND user_id = $2;

-- name: GetUserDMConversations :many
SELECT dc.* FROM dm_conversations dc
JOIN dm_participants dp ON dc.id = dp.conversation_id
WHERE dp.user_id = $1
ORDER BY dc.created_at DESC;

-- name: GetDMParticipants :many
SELECT u.id, u.username, u.display_name, u.avatar_url, u.status
FROM dm_participants dp
JOIN users u ON dp.user_id = u.id
WHERE dp.conversation_id = $1;

-- name: CreateDMMessage :one
INSERT INTO dm_messages (conversation_id, author_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetDMMessages :many
SELECT dm.*, u.username as author_username, u.display_name as author_display_name, u.avatar_url as author_avatar_url
FROM dm_messages dm
JOIN users u ON dm.author_id = u.id
WHERE dm.conversation_id = $1
  AND ($2::timestamptz IS NULL OR dm.created_at < $2)
ORDER BY dm.created_at DESC
LIMIT $3;

-- name: FindExistingDMConversation :one
SELECT dc.id FROM dm_conversations dc
WHERE dc.is_group = FALSE
  AND EXISTS (SELECT 1 FROM dm_participants WHERE conversation_id = dc.id AND user_id = $1)
  AND EXISTS (SELECT 1 FROM dm_participants WHERE conversation_id = dc.id AND user_id = $2);
