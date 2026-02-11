-- name: CreateUser :one
INSERT INTO users (username, email, password_hash, display_name)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: GetUserByKratosID :one
SELECT * FROM users WHERE kratos_id = $1;

-- name: SetUserKratosID :exec
UPDATE users SET kratos_id = $2, updated_at = NOW() WHERE id = $1;

-- name: CreateUserFromKratos :one
INSERT INTO users (username, email, password_hash, kratos_id)
VALUES ($1, $2, '', $3)
RETURNING *;

-- name: UpdateUserStatus :exec
UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1;

-- name: UpdateUserProfile :one
UPDATE users
SET display_name = COALESCE($2, display_name),
    avatar_url = COALESCE($3, avatar_url),
    updated_at = NOW()
WHERE id = $1
RETURNING *;
