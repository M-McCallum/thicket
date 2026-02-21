package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// AutoModRule represents a server automod rule.
type AutoModRule struct {
	ID              uuid.UUID       `json:"id"`
	ServerID        uuid.UUID       `json:"server_id"`
	Name            string          `json:"name"`
	Type            string          `json:"type"`
	TriggerData     json.RawMessage `json:"trigger_data"`
	Action          string          `json:"action"`
	ActionMetadata  json.RawMessage `json:"action_metadata"`
	Enabled         bool            `json:"enabled"`
	ExemptRoles     []uuid.UUID     `json:"exempt_roles"`
	ExemptChannels  []uuid.UUID     `json:"exempt_channels"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type CreateAutoModRuleParams struct {
	ServerID       uuid.UUID
	Name           string
	Type           string
	TriggerData    json.RawMessage
	Action         string
	ActionMetadata json.RawMessage
	Enabled        bool
	ExemptRoles    []uuid.UUID
	ExemptChannels []uuid.UUID
}

func (q *Queries) CreateAutoModRule(ctx context.Context, arg CreateAutoModRuleParams) (AutoModRule, error) {
	if arg.TriggerData == nil {
		arg.TriggerData = json.RawMessage(`{}`)
	}
	if arg.ActionMetadata == nil {
		arg.ActionMetadata = json.RawMessage(`{}`)
	}
	if arg.ExemptRoles == nil {
		arg.ExemptRoles = []uuid.UUID{}
	}
	if arg.ExemptChannels == nil {
		arg.ExemptChannels = []uuid.UUID{}
	}

	row := q.db.QueryRow(ctx,
		`INSERT INTO automod_rules (server_id, name, type, trigger_data, action, action_metadata, enabled, exempt_roles, exempt_channels)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, server_id, name, type, trigger_data, action, action_metadata, enabled, exempt_roles, exempt_channels, created_at, updated_at`,
		arg.ServerID, arg.Name, arg.Type, arg.TriggerData, arg.Action, arg.ActionMetadata,
		arg.Enabled, arg.ExemptRoles, arg.ExemptChannels,
	)
	return scanAutoModRule(row)
}

func (q *Queries) GetAutoModRulesByServer(ctx context.Context, serverID uuid.UUID) ([]AutoModRule, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, name, type, trigger_data, action, action_metadata, enabled, exempt_roles, exempt_channels, created_at, updated_at
		FROM automod_rules WHERE server_id = $1 ORDER BY created_at ASC`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []AutoModRule
	for rows.Next() {
		r, err := scanAutoModRuleFromRows(rows)
		if err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	if rules == nil {
		rules = []AutoModRule{}
	}
	return rules, rows.Err()
}

func (q *Queries) GetEnabledAutoModRulesByServer(ctx context.Context, serverID uuid.UUID) ([]AutoModRule, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, name, type, trigger_data, action, action_metadata, enabled, exempt_roles, exempt_channels, created_at, updated_at
		FROM automod_rules WHERE server_id = $1 AND enabled = TRUE ORDER BY created_at ASC`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []AutoModRule
	for rows.Next() {
		r, err := scanAutoModRuleFromRows(rows)
		if err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	if rules == nil {
		rules = []AutoModRule{}
	}
	return rules, rows.Err()
}

func (q *Queries) GetAutoModRuleByID(ctx context.Context, ruleID uuid.UUID) (AutoModRule, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, server_id, name, type, trigger_data, action, action_metadata, enabled, exempt_roles, exempt_channels, created_at, updated_at
		FROM automod_rules WHERE id = $1`, ruleID,
	)
	return scanAutoModRule(row)
}

type UpdateAutoModRuleParams struct {
	ID             uuid.UUID
	Name           *string
	TriggerData    json.RawMessage
	Action         *string
	ActionMetadata json.RawMessage
	Enabled        *bool
	ExemptRoles    []uuid.UUID
	ExemptChannels []uuid.UUID
}

func (q *Queries) UpdateAutoModRule(ctx context.Context, arg UpdateAutoModRuleParams) (AutoModRule, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE automod_rules SET
			name = COALESCE($2, name),
			trigger_data = COALESCE($3, trigger_data),
			action = COALESCE($4, action),
			action_metadata = COALESCE($5, action_metadata),
			enabled = COALESCE($6, enabled),
			exempt_roles = COALESCE($7, exempt_roles),
			exempt_channels = COALESCE($8, exempt_channels),
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, server_id, name, type, trigger_data, action, action_metadata, enabled, exempt_roles, exempt_channels, created_at, updated_at`,
		arg.ID, arg.Name, arg.TriggerData, arg.Action, arg.ActionMetadata,
		arg.Enabled, arg.ExemptRoles, arg.ExemptChannels,
	)
	return scanAutoModRule(row)
}

func (q *Queries) DeleteAutoModRule(ctx context.Context, ruleID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM automod_rules WHERE id = $1`, ruleID)
	return err
}

// CountRecentMessages counts messages by a user in a server within a time window.
func (q *Queries) CountRecentMessages(ctx context.Context, serverID, userID uuid.UUID, since time.Time) (int, error) {
	var count int
	err := q.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM messages m
		JOIN channels c ON m.channel_id = c.id
		WHERE c.server_id = $1 AND m.author_id = $2 AND m.created_at >= $3`,
		serverID, userID, since,
	).Scan(&count)
	return count, err
}

func scanAutoModRule(row pgx.Row) (AutoModRule, error) {
	var r AutoModRule
	err := row.Scan(
		&r.ID, &r.ServerID, &r.Name, &r.Type, &r.TriggerData, &r.Action,
		&r.ActionMetadata, &r.Enabled, &r.ExemptRoles, &r.ExemptChannels,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if r.ExemptRoles == nil {
		r.ExemptRoles = []uuid.UUID{}
	}
	if r.ExemptChannels == nil {
		r.ExemptChannels = []uuid.UUID{}
	}
	return r, err
}

func scanAutoModRuleFromRows(rows pgx.Rows) (AutoModRule, error) {
	var r AutoModRule
	err := rows.Scan(
		&r.ID, &r.ServerID, &r.Name, &r.Type, &r.TriggerData, &r.Action,
		&r.ActionMetadata, &r.Enabled, &r.ExemptRoles, &r.ExemptChannels,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if r.ExemptRoles == nil {
		r.ExemptRoles = []uuid.UUID{}
	}
	if r.ExemptChannels == nil {
		r.ExemptChannels = []uuid.UUID{}
	}
	return r, err
}
