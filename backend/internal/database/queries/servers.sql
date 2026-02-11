-- name: CreateServer :one
INSERT INTO servers (name, owner_id, invite_code)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetServerByID :one
SELECT * FROM servers WHERE id = $1;

-- name: GetServerByInviteCode :one
SELECT * FROM servers WHERE invite_code = $1;

-- name: GetUserServers :many
SELECT s.* FROM servers s
JOIN server_members sm ON s.id = sm.server_id
WHERE sm.user_id = $1
ORDER BY s.name;

-- name: UpdateServer :one
UPDATE servers
SET name = COALESCE($2, name),
    icon_url = COALESCE($3, icon_url),
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteServer :exec
DELETE FROM servers WHERE id = $1;

-- name: AddServerMember :exec
INSERT INTO server_members (server_id, user_id, role)
VALUES ($1, $2, $3);

-- name: RemoveServerMember :exec
DELETE FROM server_members WHERE server_id = $1 AND user_id = $2;

-- name: GetServerMember :one
SELECT * FROM server_members WHERE server_id = $1 AND user_id = $2;

-- name: GetServerMembers :many
SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, sm.role, sm.nickname
FROM server_members sm
JOIN users u ON sm.user_id = u.id
WHERE sm.server_id = $1
ORDER BY u.username;

-- name: UpdateMemberRole :exec
UPDATE server_members SET role = $3 WHERE server_id = $1 AND user_id = $2;
