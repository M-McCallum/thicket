package models

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CreateUserParams struct {
	Username     string
	Email        string
	PasswordHash string
	DisplayName  *string
}

func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (User, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO users (username, email, password_hash, display_name)
		VALUES ($1, $2, $3, $4)
		RETURNING id, username, email, password_hash, avatar_url, display_name, status, kratos_id, created_at, updated_at`,
		arg.Username, arg.Email, arg.PasswordHash, arg.DisplayName,
	)
	return scanUser(row)
}

func (q *Queries) GetUserByID(ctx context.Context, id uuid.UUID) (User, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, username, email, password_hash, avatar_url, display_name, status, kratos_id, created_at, updated_at
		FROM users WHERE id = $1`, id,
	)
	return scanUser(row)
}

func (q *Queries) GetUserByEmail(ctx context.Context, email string) (User, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, username, email, password_hash, avatar_url, display_name, status, kratos_id, created_at, updated_at
		FROM users WHERE email = $1`, email,
	)
	return scanUser(row)
}

func (q *Queries) GetUserByUsername(ctx context.Context, username string) (User, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, username, email, password_hash, avatar_url, display_name, status, kratos_id, created_at, updated_at
		FROM users WHERE username = $1`, username,
	)
	return scanUser(row)
}

func (q *Queries) GetUserByKratosID(ctx context.Context, kratosID uuid.UUID) (User, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, username, email, password_hash, avatar_url, display_name, status, kratos_id, created_at, updated_at
		FROM users WHERE kratos_id = $1`, kratosID,
	)
	return scanUser(row)
}

func (q *Queries) SetUserKratosID(ctx context.Context, id uuid.UUID, kratosID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`UPDATE users SET kratos_id = $2, updated_at = NOW() WHERE id = $1`,
		id, kratosID,
	)
	return err
}

type CreateUserFromKratosParams struct {
	Username string
	Email    string
	KratosID uuid.UUID
}

func (q *Queries) CreateUserFromKratos(ctx context.Context, arg CreateUserFromKratosParams) (User, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO users (username, email, password_hash, kratos_id)
		VALUES ($1, $2, '', $3)
		RETURNING id, username, email, password_hash, avatar_url, display_name, status, kratos_id, created_at, updated_at`,
		arg.Username, arg.Email, arg.KratosID,
	)
	return scanUser(row)
}

func (q *Queries) UpdateUserStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1`,
		id, status,
	)
	return err
}

type UpdateUserProfileParams struct {
	ID          uuid.UUID
	DisplayName *string
	AvatarURL   *string
}

func (q *Queries) UpdateUserProfile(ctx context.Context, arg UpdateUserProfileParams) (User, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE users
		SET display_name = COALESCE($2, display_name),
		    avatar_url = COALESCE($3, avatar_url),
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, username, email, password_hash, avatar_url, display_name, status, kratos_id, created_at, updated_at`,
		arg.ID, arg.DisplayName, arg.AvatarURL,
	)
	return scanUser(row)
}

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash,
		&u.AvatarURL, &u.DisplayName, &u.Status, &u.KratosID,
		&u.CreatedAt, &u.UpdatedAt,
	)
	return u, err
}
