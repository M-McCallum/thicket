package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// BotUser represents a bot account.
type BotUser struct {
	ID          uuid.UUID `json:"id"`
	OwnerID     uuid.UUID `json:"owner_id"`
	Username    string    `json:"username"`
	AvatarURL   string    `json:"avatar_url"`
	TokenHash   string    `json:"-"`
	Permissions int64     `json:"permissions"`
	CreatedAt   time.Time `json:"created_at"`
}

// Webhook represents a channel webhook.
type Webhook struct {
	ID        uuid.UUID `json:"id"`
	ChannelID uuid.UUID `json:"channel_id"`
	Name      string    `json:"name"`
	AvatarURL string    `json:"avatar_url"`
	Token     string    `json:"-"`
	CreatorID uuid.UUID `json:"creator_id"`
	CreatedAt time.Time `json:"created_at"`
}

// SlashCommand represents a bot slash command.
type SlashCommand struct {
	ID          uuid.UUID        `json:"id"`
	BotID       uuid.UUID        `json:"bot_id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Options     json.RawMessage  `json:"options"`
	ServerID    *uuid.UUID       `json:"server_id"`
	CreatedAt   time.Time        `json:"created_at"`
}

// --- Bot CRUD ---

type CreateBotUserParams struct {
	OwnerID   uuid.UUID
	Username  string
	TokenHash string
}

func (q *Queries) CreateBotUser(ctx context.Context, arg CreateBotUserParams) (BotUser, error) {
	var b BotUser
	err := q.db.QueryRow(ctx,
		`INSERT INTO bot_users (owner_id, username, token_hash)
		VALUES ($1, $2, $3)
		RETURNING id, owner_id, username, avatar_url, token_hash, permissions, created_at`,
		arg.OwnerID, arg.Username, arg.TokenHash,
	).Scan(&b.ID, &b.OwnerID, &b.Username, &b.AvatarURL, &b.TokenHash, &b.Permissions, &b.CreatedAt)
	return b, err
}

func (q *Queries) GetBotUserByID(ctx context.Context, id uuid.UUID) (BotUser, error) {
	var b BotUser
	err := q.db.QueryRow(ctx,
		`SELECT id, owner_id, username, avatar_url, token_hash, permissions, created_at
		FROM bot_users WHERE id = $1`, id,
	).Scan(&b.ID, &b.OwnerID, &b.Username, &b.AvatarURL, &b.TokenHash, &b.Permissions, &b.CreatedAt)
	return b, err
}

func (q *Queries) GetBotUsersByOwner(ctx context.Context, ownerID uuid.UUID) ([]BotUser, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, owner_id, username, avatar_url, token_hash, permissions, created_at
		FROM bot_users WHERE owner_id = $1 ORDER BY created_at DESC`, ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bots []BotUser
	for rows.Next() {
		var b BotUser
		if err := rows.Scan(&b.ID, &b.OwnerID, &b.Username, &b.AvatarURL, &b.TokenHash, &b.Permissions, &b.CreatedAt); err != nil {
			return nil, err
		}
		bots = append(bots, b)
	}
	if bots == nil {
		bots = []BotUser{}
	}
	return bots, rows.Err()
}

func (q *Queries) UpdateBotTokenHash(ctx context.Context, id uuid.UUID, tokenHash string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE bot_users SET token_hash = $2 WHERE id = $1`,
		id, tokenHash,
	)
	return err
}

func (q *Queries) DeleteBotUser(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM bot_users WHERE id = $1`, id)
	return err
}

// GetAllBotUsers returns all bot users (for token validation lookup).
func (q *Queries) GetAllBotUsers(ctx context.Context) ([]BotUser, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, owner_id, username, avatar_url, token_hash, permissions, created_at
		FROM bot_users`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bots []BotUser
	for rows.Next() {
		var b BotUser
		if err := rows.Scan(&b.ID, &b.OwnerID, &b.Username, &b.AvatarURL, &b.TokenHash, &b.Permissions, &b.CreatedAt); err != nil {
			return nil, err
		}
		bots = append(bots, b)
	}
	if bots == nil {
		bots = []BotUser{}
	}
	return bots, rows.Err()
}

// --- Webhook CRUD ---

type CreateWebhookParams struct {
	ChannelID uuid.UUID
	Name      string
	Token     string
	CreatorID uuid.UUID
}

func (q *Queries) CreateWebhook(ctx context.Context, arg CreateWebhookParams) (Webhook, error) {
	var w Webhook
	err := q.db.QueryRow(ctx,
		`INSERT INTO webhooks (channel_id, name, token, creator_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, channel_id, name, avatar_url, token, creator_id, created_at`,
		arg.ChannelID, arg.Name, arg.Token, arg.CreatorID,
	).Scan(&w.ID, &w.ChannelID, &w.Name, &w.AvatarURL, &w.Token, &w.CreatorID, &w.CreatedAt)
	return w, err
}

func (q *Queries) GetWebhookByID(ctx context.Context, id uuid.UUID) (Webhook, error) {
	var w Webhook
	err := q.db.QueryRow(ctx,
		`SELECT id, channel_id, name, avatar_url, token, creator_id, created_at
		FROM webhooks WHERE id = $1`, id,
	).Scan(&w.ID, &w.ChannelID, &w.Name, &w.AvatarURL, &w.Token, &w.CreatorID, &w.CreatedAt)
	return w, err
}

func (q *Queries) GetWebhooksByChannel(ctx context.Context, channelID uuid.UUID) ([]Webhook, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, channel_id, name, avatar_url, token, creator_id, created_at
		FROM webhooks WHERE channel_id = $1 ORDER BY created_at DESC`, channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var webhooks []Webhook
	for rows.Next() {
		var w Webhook
		if err := rows.Scan(&w.ID, &w.ChannelID, &w.Name, &w.AvatarURL, &w.Token, &w.CreatorID, &w.CreatedAt); err != nil {
			return nil, err
		}
		webhooks = append(webhooks, w)
	}
	if webhooks == nil {
		webhooks = []Webhook{}
	}
	return webhooks, rows.Err()
}

func (q *Queries) DeleteWebhook(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM webhooks WHERE id = $1`, id)
	return err
}

// --- Slash Command CRUD ---

type CreateSlashCommandParams struct {
	BotID       uuid.UUID
	Name        string
	Description string
	Options     json.RawMessage
	ServerID    *uuid.UUID
}

func (q *Queries) CreateSlashCommand(ctx context.Context, arg CreateSlashCommandParams) (SlashCommand, error) {
	opts := arg.Options
	if opts == nil {
		opts = json.RawMessage("[]")
	}
	var sc SlashCommand
	err := q.db.QueryRow(ctx,
		`INSERT INTO slash_commands (bot_id, name, description, options, server_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, bot_id, name, description, options, server_id, created_at`,
		arg.BotID, arg.Name, arg.Description, opts, arg.ServerID,
	).Scan(&sc.ID, &sc.BotID, &sc.Name, &sc.Description, &sc.Options, &sc.ServerID, &sc.CreatedAt)
	return sc, err
}

func (q *Queries) GetSlashCommandsByBot(ctx context.Context, botID uuid.UUID) ([]SlashCommand, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, bot_id, name, description, options, server_id, created_at
		FROM slash_commands WHERE bot_id = $1 ORDER BY name`, botID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cmds []SlashCommand
	for rows.Next() {
		var sc SlashCommand
		if err := rows.Scan(&sc.ID, &sc.BotID, &sc.Name, &sc.Description, &sc.Options, &sc.ServerID, &sc.CreatedAt); err != nil {
			return nil, err
		}
		cmds = append(cmds, sc)
	}
	if cmds == nil {
		cmds = []SlashCommand{}
	}
	return cmds, rows.Err()
}

func (q *Queries) DeleteSlashCommand(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM slash_commands WHERE id = $1`, id)
	return err
}
