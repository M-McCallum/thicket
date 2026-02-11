-- name: CreateSession :one
INSERT INTO sessions (user_id, refresh_token, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetSessionByToken :one
SELECT * FROM sessions WHERE refresh_token = $1 AND expires_at > NOW();

-- name: DeleteSession :exec
DELETE FROM sessions WHERE id = $1;

-- name: DeleteSessionByToken :exec
DELETE FROM sessions WHERE refresh_token = $1;

-- name: DeleteUserSessions :exec
DELETE FROM sessions WHERE user_id = $1;

-- name: CountUserSessions :one
SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND expires_at > NOW();

-- name: DeleteOldestUserSession :exec
DELETE FROM sessions
WHERE id = (
    SELECT id FROM sessions
    WHERE user_id = $1
    ORDER BY created_at ASC
    LIMIT 1
);
