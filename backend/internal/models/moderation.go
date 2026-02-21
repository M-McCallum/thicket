package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ServerBan represents a ban record in a server.
type ServerBan struct {
	ID        uuid.UUID `json:"id"`
	ServerID  uuid.UUID `json:"server_id"`
	UserID    uuid.UUID `json:"user_id"`
	BannedBy  uuid.UUID `json:"banned_by"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
	// Joined from users table for display
	Username    string  `json:"username,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}

// ServerTimeout represents an active timeout record in a server.
type ServerTimeout struct {
	ID          uuid.UUID `json:"id"`
	ServerID    uuid.UUID `json:"server_id"`
	UserID      uuid.UUID `json:"user_id"`
	TimedOutBy  uuid.UUID `json:"timed_out_by"`
	Reason      string    `json:"reason"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
	// Joined from users table for display
	Username    string  `json:"username,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}

// AuditLogEntry represents an entry in the server audit log.
type AuditLogEntry struct {
	ID         uuid.UUID        `json:"id"`
	ServerID   uuid.UUID        `json:"server_id"`
	ActorID    uuid.UUID        `json:"actor_id"`
	Action     string           `json:"action"`
	TargetID   *uuid.UUID       `json:"target_id"`
	TargetType *string          `json:"target_type"`
	Changes    json.RawMessage  `json:"changes"`
	Reason     string           `json:"reason"`
	CreatedAt  time.Time        `json:"created_at"`
	// Joined from users table
	ActorUsername string `json:"actor_username,omitempty"`
}

// CreateBan inserts a new ban record.
func (q *Queries) CreateBan(ctx context.Context, serverID, userID, bannedBy uuid.UUID, reason string) (ServerBan, error) {
	var b ServerBan
	err := q.db.QueryRow(ctx,
		`INSERT INTO server_bans (server_id, user_id, banned_by, reason)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (server_id, user_id) DO UPDATE SET banned_by = $3, reason = $4, created_at = NOW()
		RETURNING id, server_id, user_id, banned_by, reason, created_at`,
		serverID, userID, bannedBy, reason,
	).Scan(&b.ID, &b.ServerID, &b.UserID, &b.BannedBy, &b.Reason, &b.CreatedAt)
	return b, err
}

// RemoveBan deletes a ban record.
func (q *Queries) RemoveBan(ctx context.Context, serverID, userID uuid.UUID) error {
	ct, err := q.db.Exec(ctx,
		`DELETE FROM server_bans WHERE server_id = $1 AND user_id = $2`,
		serverID, userID,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// IsUserBanned checks if a user is banned from a server.
func (q *Queries) IsUserBanned(ctx context.Context, serverID, userID uuid.UUID) (bool, error) {
	var exists bool
	err := q.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM server_bans WHERE server_id = $1 AND user_id = $2)`,
		serverID, userID,
	).Scan(&exists)
	return exists, err
}

// GetServerBans returns all bans for a server with user info.
func (q *Queries) GetServerBans(ctx context.Context, serverID uuid.UUID) ([]ServerBan, error) {
	rows, err := q.db.Query(ctx,
		`SELECT b.id, b.server_id, b.user_id, b.banned_by, b.reason, b.created_at,
		        u.username, u.display_name, u.avatar_url
		FROM server_bans b
		JOIN users u ON b.user_id = u.id
		WHERE b.server_id = $1
		ORDER BY b.created_at DESC`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bans []ServerBan
	for rows.Next() {
		var b ServerBan
		if err := rows.Scan(&b.ID, &b.ServerID, &b.UserID, &b.BannedBy, &b.Reason, &b.CreatedAt,
			&b.Username, &b.DisplayName, &b.AvatarURL); err != nil {
			return nil, err
		}
		bans = append(bans, b)
	}
	if bans == nil {
		bans = []ServerBan{}
	}
	return bans, rows.Err()
}

// CreateTimeout inserts or replaces a timeout record.
func (q *Queries) CreateTimeout(ctx context.Context, serverID, userID, timedOutBy uuid.UUID, reason string, expiresAt time.Time) (ServerTimeout, error) {
	var t ServerTimeout
	err := q.db.QueryRow(ctx,
		`INSERT INTO server_timeouts (server_id, user_id, timed_out_by, reason, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (server_id, user_id) DO UPDATE SET timed_out_by = $3, reason = $4, expires_at = $5, created_at = NOW()
		RETURNING id, server_id, user_id, timed_out_by, reason, expires_at, created_at`,
		serverID, userID, timedOutBy, reason, expiresAt,
	).Scan(&t.ID, &t.ServerID, &t.UserID, &t.TimedOutBy, &t.Reason, &t.ExpiresAt, &t.CreatedAt)
	return t, err
}

// RemoveTimeout deletes a timeout record.
func (q *Queries) RemoveTimeout(ctx context.Context, serverID, userID uuid.UUID) error {
	ct, err := q.db.Exec(ctx,
		`DELETE FROM server_timeouts WHERE server_id = $1 AND user_id = $2`,
		serverID, userID,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// IsUserTimedOut checks if a user has an active (non-expired) timeout in a server.
func (q *Queries) IsUserTimedOut(ctx context.Context, serverID, userID uuid.UUID) (bool, error) {
	var exists bool
	err := q.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM server_timeouts WHERE server_id = $1 AND user_id = $2 AND expires_at > NOW())`,
		serverID, userID,
	).Scan(&exists)
	return exists, err
}

// GetServerTimeouts returns all active timeouts for a server with user info.
func (q *Queries) GetServerTimeouts(ctx context.Context, serverID uuid.UUID) ([]ServerTimeout, error) {
	rows, err := q.db.Query(ctx,
		`SELECT t.id, t.server_id, t.user_id, t.timed_out_by, t.reason, t.expires_at, t.created_at,
		        u.username, u.display_name, u.avatar_url
		FROM server_timeouts t
		JOIN users u ON t.user_id = u.id
		WHERE t.server_id = $1 AND t.expires_at > NOW()
		ORDER BY t.expires_at ASC`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var timeouts []ServerTimeout
	for rows.Next() {
		var t ServerTimeout
		if err := rows.Scan(&t.ID, &t.ServerID, &t.UserID, &t.TimedOutBy, &t.Reason, &t.ExpiresAt, &t.CreatedAt,
			&t.Username, &t.DisplayName, &t.AvatarURL); err != nil {
			return nil, err
		}
		timeouts = append(timeouts, t)
	}
	if timeouts == nil {
		timeouts = []ServerTimeout{}
	}
	return timeouts, rows.Err()
}

// InsertAuditLog creates an audit log entry.
func (q *Queries) InsertAuditLog(ctx context.Context, serverID, actorID uuid.UUID, action string, targetID *uuid.UUID, targetType *string, changes json.RawMessage, reason string) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO audit_log (server_id, actor_id, action, target_id, target_type, changes, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		serverID, actorID, action, targetID, targetType, changes, reason,
	)
	return err
}

// GetAuditLog returns audit log entries for a server, newest first.
func (q *Queries) GetAuditLog(ctx context.Context, serverID uuid.UUID, limit int32, before *time.Time) ([]AuditLogEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var rows pgx.Rows
	var err error
	if before != nil {
		rows, err = q.db.Query(ctx,
			`SELECT a.id, a.server_id, a.actor_id, a.action, a.target_id, a.target_type, a.changes, a.reason, a.created_at,
			        u.username
			FROM audit_log a
			JOIN users u ON a.actor_id = u.id
			WHERE a.server_id = $1 AND a.created_at < $2
			ORDER BY a.created_at DESC
			LIMIT $3`, serverID, before, limit,
		)
	} else {
		rows, err = q.db.Query(ctx,
			`SELECT a.id, a.server_id, a.actor_id, a.action, a.target_id, a.target_type, a.changes, a.reason, a.created_at,
			        u.username
			FROM audit_log a
			JOIN users u ON a.actor_id = u.id
			WHERE a.server_id = $1
			ORDER BY a.created_at DESC
			LIMIT $2`, serverID, limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []AuditLogEntry
	for rows.Next() {
		var e AuditLogEntry
		if err := rows.Scan(&e.ID, &e.ServerID, &e.ActorID, &e.Action, &e.TargetID, &e.TargetType, &e.Changes, &e.Reason, &e.CreatedAt, &e.ActorUsername); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []AuditLogEntry{}
	}
	return entries, rows.Err()
}
