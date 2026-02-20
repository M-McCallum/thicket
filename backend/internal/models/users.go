package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const userColumns = `id, username, email, avatar_url, display_name, status, kratos_id,
	bio, pronouns, custom_status_text, custom_status_emoji, custom_status_expires_at,
	created_at, updated_at`

type CreateUserParams struct {
	Username    string
	Email       string
	KratosID    uuid.UUID
	DisplayName *string
}

func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (User, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO users (username, email, kratos_id, display_name)
		VALUES ($1, $2, $3, $4)
		RETURNING `+userColumns,
		arg.Username, arg.Email, arg.KratosID, arg.DisplayName,
	)
	return scanUser(row)
}

func (q *Queries) GetUserByID(ctx context.Context, id uuid.UUID) (User, error) {
	row := q.db.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE id = $1`, id,
	)
	return scanUser(row)
}

func (q *Queries) GetUserByEmail(ctx context.Context, email string) (User, error) {
	row := q.db.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE email = $1`, email,
	)
	return scanUser(row)
}

func (q *Queries) GetUserByUsername(ctx context.Context, username string) (User, error) {
	row := q.db.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE username = $1`, username,
	)
	return scanUser(row)
}

func (q *Queries) GetUserByKratosID(ctx context.Context, kratosID uuid.UUID) (User, error) {
	row := q.db.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE kratos_id = $1`, kratosID,
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
		`INSERT INTO users (username, email, kratos_id)
		VALUES ($1, $2, $3)
		RETURNING `+userColumns,
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
		RETURNING `+userColumns,
		arg.ID, arg.DisplayName, arg.AvatarURL,
	)
	return scanUser(row)
}

type UpdateFullProfileParams struct {
	ID          uuid.UUID
	DisplayName *string
	Bio         *string
	Pronouns    *string
}

func (q *Queries) UpdateFullProfile(ctx context.Context, arg UpdateFullProfileParams) (User, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE users
		SET display_name = COALESCE($2, display_name),
		    bio = COALESCE($3, bio),
		    pronouns = COALESCE($4, pronouns),
		    updated_at = NOW()
		WHERE id = $1
		RETURNING `+userColumns,
		arg.ID, arg.DisplayName, arg.Bio, arg.Pronouns,
	)
	return scanUser(row)
}

type UpdateCustomStatusParams struct {
	ID                    uuid.UUID
	CustomStatusText      string
	CustomStatusEmoji     string
	CustomStatusExpiresAt *time.Time
}

func (q *Queries) UpdateCustomStatus(ctx context.Context, arg UpdateCustomStatusParams) (User, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE users
		SET custom_status_text = $2,
		    custom_status_emoji = $3,
		    custom_status_expires_at = $4,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING `+userColumns,
		arg.ID, arg.CustomStatusText, arg.CustomStatusEmoji, arg.CustomStatusExpiresAt,
	)
	return scanUser(row)
}

func (q *Queries) ClearAvatarURL(ctx context.Context, id uuid.UUID) (User, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE users
		SET avatar_url = NULL, updated_at = NOW()
		WHERE id = $1
		RETURNING `+userColumns,
		id,
	)
	return scanUser(row)
}

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(
		&u.ID, &u.Username, &u.Email,
		&u.AvatarURL, &u.DisplayName, &u.Status, &u.KratosID,
		&u.Bio, &u.Pronouns, &u.CustomStatusText, &u.CustomStatusEmoji, &u.CustomStatusExpiresAt,
		&u.CreatedAt, &u.UpdatedAt,
	)
	return u, err
}
