package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// OnboardingPrompt is one step/question in a server's onboarding flow.
type OnboardingPrompt struct {
	ID          uuid.UUID          `json:"id"`
	ServerID    uuid.UUID          `json:"server_id"`
	Title       string             `json:"title"`
	Description string             `json:"description"`
	Required    bool               `json:"required"`
	Position    int                `json:"position"`
	CreatedAt   time.Time          `json:"created_at"`
	Options     []OnboardingOption `json:"options"`
}

// OnboardingOption is a selectable choice within a prompt.
type OnboardingOption struct {
	ID          uuid.UUID   `json:"id"`
	PromptID    uuid.UUID   `json:"prompt_id"`
	Label       string      `json:"label"`
	Description string      `json:"description"`
	Emoji       string      `json:"emoji"`
	RoleIDs     []uuid.UUID `json:"role_ids"`
	ChannelIDs  []uuid.UUID `json:"channel_ids"`
	Position    int         `json:"position"`
}

// WelcomeConfig represents the welcome screen configuration for a server.
type WelcomeConfig struct {
	WelcomeMessage  string      `json:"welcome_message"`
	WelcomeChannels []uuid.UUID `json:"welcome_channels"`
}

// --- Queries ---

func (q *Queries) UpdateWelcomeConfig(ctx context.Context, serverID uuid.UUID, message string, channelIDs []uuid.UUID) (Server, error) {
	if channelIDs == nil {
		channelIDs = []uuid.UUID{}
	}
	row := q.db.QueryRow(ctx,
		`UPDATE servers SET welcome_message = $2, welcome_channels = $3, updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, icon_url, owner_id, invite_code, welcome_message, welcome_channels, created_at, updated_at`,
		serverID, message, channelIDs,
	)
	return scanServer(row)
}

// --- Onboarding Prompts ---

func (q *Queries) GetOnboardingPrompts(ctx context.Context, serverID uuid.UUID) ([]OnboardingPrompt, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, title, description, required, position, created_at
		FROM onboarding_prompts WHERE server_id = $1 ORDER BY position`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prompts []OnboardingPrompt
	for rows.Next() {
		var p OnboardingPrompt
		if err := rows.Scan(&p.ID, &p.ServerID, &p.Title, &p.Description, &p.Required, &p.Position, &p.CreatedAt); err != nil {
			return nil, err
		}
		p.Options = []OnboardingOption{} // initialize empty
		prompts = append(prompts, p)
	}
	if prompts == nil {
		prompts = []OnboardingPrompt{}
	}
	return prompts, rows.Err()
}

func (q *Queries) CreateOnboardingPrompt(ctx context.Context, serverID uuid.UUID, title, description string, required bool, position int) (OnboardingPrompt, error) {
	var p OnboardingPrompt
	err := q.db.QueryRow(ctx,
		`INSERT INTO onboarding_prompts (server_id, title, description, required, position)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, server_id, title, description, required, position, created_at`,
		serverID, title, description, required, position,
	).Scan(&p.ID, &p.ServerID, &p.Title, &p.Description, &p.Required, &p.Position, &p.CreatedAt)
	p.Options = []OnboardingOption{}
	return p, err
}

func (q *Queries) UpdateOnboardingPrompt(ctx context.Context, id uuid.UUID, title, description string, required bool, position int) (OnboardingPrompt, error) {
	var p OnboardingPrompt
	err := q.db.QueryRow(ctx,
		`UPDATE onboarding_prompts SET title = $2, description = $3, required = $4, position = $5
		WHERE id = $1
		RETURNING id, server_id, title, description, required, position, created_at`,
		id, title, description, required, position,
	).Scan(&p.ID, &p.ServerID, &p.Title, &p.Description, &p.Required, &p.Position, &p.CreatedAt)
	p.Options = []OnboardingOption{}
	return p, err
}

func (q *Queries) DeleteOnboardingPrompt(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM onboarding_prompts WHERE id = $1`, id)
	return err
}

func (q *Queries) DeleteAllOnboardingPrompts(ctx context.Context, serverID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM onboarding_prompts WHERE server_id = $1`, serverID)
	return err
}

// --- Onboarding Options ---

func (q *Queries) GetOnboardingOptions(ctx context.Context, promptID uuid.UUID) ([]OnboardingOption, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, prompt_id, label, description, emoji, role_ids, channel_ids, position
		FROM onboarding_options WHERE prompt_id = $1 ORDER BY position`, promptID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var options []OnboardingOption
	for rows.Next() {
		var o OnboardingOption
		if err := rows.Scan(&o.ID, &o.PromptID, &o.Label, &o.Description, &o.Emoji, &o.RoleIDs, &o.ChannelIDs, &o.Position); err != nil {
			return nil, err
		}
		if o.RoleIDs == nil {
			o.RoleIDs = []uuid.UUID{}
		}
		if o.ChannelIDs == nil {
			o.ChannelIDs = []uuid.UUID{}
		}
		options = append(options, o)
	}
	if options == nil {
		options = []OnboardingOption{}
	}
	return options, rows.Err()
}

func (q *Queries) GetAllOnboardingOptions(ctx context.Context, serverID uuid.UUID) ([]OnboardingOption, error) {
	rows, err := q.db.Query(ctx,
		`SELECT o.id, o.prompt_id, o.label, o.description, o.emoji, o.role_ids, o.channel_ids, o.position
		FROM onboarding_options o
		JOIN onboarding_prompts p ON o.prompt_id = p.id
		WHERE p.server_id = $1
		ORDER BY p.position, o.position`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var options []OnboardingOption
	for rows.Next() {
		var o OnboardingOption
		if err := rows.Scan(&o.ID, &o.PromptID, &o.Label, &o.Description, &o.Emoji, &o.RoleIDs, &o.ChannelIDs, &o.Position); err != nil {
			return nil, err
		}
		if o.RoleIDs == nil {
			o.RoleIDs = []uuid.UUID{}
		}
		if o.ChannelIDs == nil {
			o.ChannelIDs = []uuid.UUID{}
		}
		options = append(options, o)
	}
	if options == nil {
		options = []OnboardingOption{}
	}
	return options, rows.Err()
}

func (q *Queries) CreateOnboardingOption(ctx context.Context, promptID uuid.UUID, label, description, emoji string, roleIDs, channelIDs []uuid.UUID, position int) (OnboardingOption, error) {
	if roleIDs == nil {
		roleIDs = []uuid.UUID{}
	}
	if channelIDs == nil {
		channelIDs = []uuid.UUID{}
	}
	var o OnboardingOption
	err := q.db.QueryRow(ctx,
		`INSERT INTO onboarding_options (prompt_id, label, description, emoji, role_ids, channel_ids, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, prompt_id, label, description, emoji, role_ids, channel_ids, position`,
		promptID, label, description, emoji, roleIDs, channelIDs, position,
	).Scan(&o.ID, &o.PromptID, &o.Label, &o.Description, &o.Emoji, &o.RoleIDs, &o.ChannelIDs, &o.Position)
	if o.RoleIDs == nil {
		o.RoleIDs = []uuid.UUID{}
	}
	if o.ChannelIDs == nil {
		o.ChannelIDs = []uuid.UUID{}
	}
	return o, err
}

func (q *Queries) DeleteOnboardingOptionsByPrompt(ctx context.Context, promptID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM onboarding_options WHERE prompt_id = $1`, promptID)
	return err
}

// --- Onboarding Completion ---

func (q *Queries) IsOnboardingCompleted(ctx context.Context, userID, serverID uuid.UUID) (bool, error) {
	var exists bool
	err := q.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM user_onboarding_completed WHERE user_id = $1 AND server_id = $2)`,
		userID, serverID,
	).Scan(&exists)
	return exists, err
}

func (q *Queries) MarkOnboardingCompleted(ctx context.Context, userID, serverID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO user_onboarding_completed (user_id, server_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, serverID,
	)
	return err
}
