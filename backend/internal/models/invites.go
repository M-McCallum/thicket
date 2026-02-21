package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ServerInvite represents a server invite link.
type ServerInvite struct {
	ID        uuid.UUID  `json:"id"`
	ServerID  uuid.UUID  `json:"server_id"`
	CreatorID uuid.UUID  `json:"creator_id"`
	Code      string     `json:"code"`
	MaxUses   *int       `json:"max_uses"`
	Uses      int        `json:"uses"`
	ExpiresAt *time.Time `json:"expires_at"`
	CreatedAt time.Time  `json:"created_at"`
}

func (q *Queries) CreateServerInvite(ctx context.Context, serverID, creatorID uuid.UUID, code string, maxUses *int, expiresAt *time.Time) (ServerInvite, error) {
	var inv ServerInvite
	err := q.db.QueryRow(ctx,
		`INSERT INTO server_invites (server_id, creator_id, code, max_uses, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, server_id, creator_id, code, max_uses, uses, expires_at, created_at`,
		serverID, creatorID, code, maxUses, expiresAt,
	).Scan(&inv.ID, &inv.ServerID, &inv.CreatorID, &inv.Code, &inv.MaxUses, &inv.Uses, &inv.ExpiresAt, &inv.CreatedAt)
	return inv, err
}

func (q *Queries) GetServerInvites(ctx context.Context, serverID uuid.UUID) ([]ServerInvite, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, creator_id, code, max_uses, uses, expires_at, created_at
		FROM server_invites WHERE server_id = $1 ORDER BY created_at DESC`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invites []ServerInvite
	for rows.Next() {
		var inv ServerInvite
		if err := rows.Scan(&inv.ID, &inv.ServerID, &inv.CreatorID, &inv.Code, &inv.MaxUses, &inv.Uses, &inv.ExpiresAt, &inv.CreatedAt); err != nil {
			return nil, err
		}
		invites = append(invites, inv)
	}
	if invites == nil {
		invites = []ServerInvite{}
	}
	return invites, rows.Err()
}

func (q *Queries) GetServerInviteByCode(ctx context.Context, code string) (ServerInvite, error) {
	var inv ServerInvite
	err := q.db.QueryRow(ctx,
		`SELECT id, server_id, creator_id, code, max_uses, uses, expires_at, created_at
		FROM server_invites WHERE code = $1`, code,
	).Scan(&inv.ID, &inv.ServerID, &inv.CreatorID, &inv.Code, &inv.MaxUses, &inv.Uses, &inv.ExpiresAt, &inv.CreatedAt)
	return inv, err
}

func (q *Queries) IncrementInviteUses(ctx context.Context, inviteID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`UPDATE server_invites SET uses = uses + 1 WHERE id = $1`, inviteID,
	)
	return err
}

func (q *Queries) DeleteServerInvite(ctx context.Context, inviteID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM server_invites WHERE id = $1`, inviteID,
	)
	return err
}

func (q *Queries) GetServerInviteByID(ctx context.Context, inviteID uuid.UUID) (ServerInvite, error) {
	var inv ServerInvite
	err := q.db.QueryRow(ctx,
		`SELECT id, server_id, creator_id, code, max_uses, uses, expires_at, created_at
		FROM server_invites WHERE id = $1`, inviteID,
	).Scan(&inv.ID, &inv.ServerID, &inv.CreatorID, &inv.Code, &inv.MaxUses, &inv.Uses, &inv.ExpiresAt, &inv.CreatedAt)
	return inv, err
}
