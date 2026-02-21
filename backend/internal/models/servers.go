package models

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CreateServerParams struct {
	Name       string
	OwnerID    uuid.UUID
	InviteCode string
}

func (q *Queries) CreateServer(ctx context.Context, arg CreateServerParams) (Server, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO servers (name, owner_id, invite_code)
		VALUES ($1, $2, $3)
		RETURNING id, name, icon_url, owner_id, invite_code, is_public, description, gifs_enabled, welcome_message, welcome_channels, created_at, updated_at`,
		arg.Name, arg.OwnerID, arg.InviteCode,
	)
	return scanServer(row)
}

func (q *Queries) GetServerByID(ctx context.Context, id uuid.UUID) (Server, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, name, icon_url, owner_id, invite_code, is_public, description, gifs_enabled, welcome_message, welcome_channels, created_at, updated_at
		FROM servers WHERE id = $1`, id,
	)
	return scanServer(row)
}

func (q *Queries) GetServerByInviteCode(ctx context.Context, inviteCode string) (Server, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, name, icon_url, owner_id, invite_code, is_public, description, gifs_enabled, welcome_message, welcome_channels, created_at, updated_at
		FROM servers WHERE invite_code = $1`, inviteCode,
	)
	return scanServer(row)
}

func (q *Queries) GetUserServers(ctx context.Context, userID uuid.UUID) ([]Server, error) {
	rows, err := q.db.Query(ctx,
		`SELECT s.id, s.name, s.icon_url, s.owner_id, s.invite_code, s.is_public, s.description, s.gifs_enabled, s.welcome_message, s.welcome_channels, s.created_at, s.updated_at
		FROM servers s JOIN server_members sm ON s.id = sm.server_id
		WHERE sm.user_id = $1 ORDER BY s.name`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var servers []Server
	for rows.Next() {
		s, err := scanServerFromRows(rows)
		if err != nil {
			return nil, err
		}
		servers = append(servers, s)
	}
	if servers == nil {
		servers = []Server{}
	}
	return servers, rows.Err()
}

type UpdateServerParams struct {
	ID          uuid.UUID
	Name        *string
	IconURL     *string
	IsPublic    *bool
	Description *string
	GifsEnabled *bool
}

func (q *Queries) UpdateServer(ctx context.Context, arg UpdateServerParams) (Server, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE servers SET name = COALESCE($2, name), icon_url = COALESCE($3, icon_url),
		 is_public = COALESCE($4, is_public), description = COALESCE($5, description),
		 gifs_enabled = COALESCE($6, gifs_enabled), updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, icon_url, owner_id, invite_code, is_public, description, gifs_enabled, welcome_message, welcome_channels, created_at, updated_at`,
		arg.ID, arg.Name, arg.IconURL, arg.IsPublic, arg.Description, arg.GifsEnabled,
	)
	return scanServer(row)
}

func (q *Queries) DeleteServer(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, id)
	return err
}

type AddServerMemberParams struct {
	ServerID uuid.UUID
	UserID   uuid.UUID
	Role     string
}

func (q *Queries) AddServerMember(ctx context.Context, arg AddServerMemberParams) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, $3)`,
		arg.ServerID, arg.UserID, arg.Role,
	)
	return err
}

func (q *Queries) RemoveServerMember(ctx context.Context, serverID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`,
		serverID, userID,
	)
	return err
}

func (q *Queries) GetServerMember(ctx context.Context, serverID, userID uuid.UUID) (ServerMember, error) {
	var sm ServerMember
	err := q.db.QueryRow(ctx,
		`SELECT server_id, user_id, role, nickname, joined_at
		FROM server_members WHERE server_id = $1 AND user_id = $2`,
		serverID, userID,
	).Scan(&sm.ServerID, &sm.UserID, &sm.Role, &sm.Nickname, &sm.JoinedAt)
	return sm, err
}

func (q *Queries) GetServerMembers(ctx context.Context, serverID uuid.UUID) ([]ServerMemberWithUser, error) {
	rows, err := q.db.Query(ctx,
		`SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, sm.role, sm.nickname
		FROM server_members sm JOIN users u ON sm.user_id = u.id
		WHERE sm.server_id = $1 ORDER BY u.username`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []ServerMemberWithUser
	for rows.Next() {
		var m ServerMemberWithUser
		if err := rows.Scan(&m.ID, &m.Username, &m.DisplayName, &m.AvatarURL, &m.Status, &m.Role, &m.Nickname); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	if members == nil {
		members = []ServerMemberWithUser{}
	}
	return members, rows.Err()
}

func (q *Queries) UpdateMemberNickname(ctx context.Context, serverID, userID uuid.UUID, nickname *string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE server_members SET nickname = $3 WHERE server_id = $1 AND user_id = $2`,
		serverID, userID, nickname,
	)
	return err
}

func (q *Queries) UpdateMemberRole(ctx context.Context, serverID, userID uuid.UUID, role string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE server_members SET role = $3 WHERE server_id = $1 AND user_id = $2`,
		serverID, userID, role,
	)
	return err
}

func (q *Queries) GetServerMemberUserIDs(ctx context.Context, serverID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := q.db.Query(ctx,
		`SELECT user_id FROM server_members WHERE server_id = $1`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (q *Queries) GetUserCoMemberIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := q.db.Query(ctx,
		`SELECT DISTINCT sm2.user_id
		FROM server_members sm1
		JOIN server_members sm2 ON sm1.server_id = sm2.server_id
		WHERE sm1.user_id = $1 AND sm2.user_id != $1`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func scanServer(row pgx.Row) (Server, error) {
	var s Server
	err := row.Scan(&s.ID, &s.Name, &s.IconURL, &s.OwnerID, &s.InviteCode, &s.IsPublic, &s.Description, &s.GifsEnabled, &s.WelcomeMessage, &s.WelcomeChannels, &s.CreatedAt, &s.UpdatedAt)
	if s.WelcomeChannels == nil {
		s.WelcomeChannels = []uuid.UUID{}
	}
	return s, err
}

func scanServerFromRows(rows pgx.Rows) (Server, error) {
	var s Server
	err := rows.Scan(&s.ID, &s.Name, &s.IconURL, &s.OwnerID, &s.InviteCode, &s.IsPublic, &s.Description, &s.GifsEnabled, &s.WelcomeMessage, &s.WelcomeChannels, &s.CreatedAt, &s.UpdatedAt)
	if s.WelcomeChannels == nil {
		s.WelcomeChannels = []uuid.UUID{}
	}
	return s, err
}

// PublicServerResult is a server listing for the discovery page.
type PublicServerResult struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	IconURL     *string   `json:"icon_url"`
	Description string    `json:"description"`
	MemberCount int64     `json:"member_count"`
	IsPublic    bool      `json:"is_public"`
}

func (q *Queries) GetPublicServers(ctx context.Context, query string, limit, offset int) ([]PublicServerResult, error) {
	rows, err := q.db.Query(ctx,
		`SELECT s.id, s.name, s.icon_url, s.description,
		 (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count,
		 s.is_public
		 FROM servers s
		 WHERE s.is_public = TRUE
		 AND (s.name ILIKE '%' || $1 || '%' OR s.description ILIKE '%' || $1 || '%')
		 ORDER BY member_count DESC
		 LIMIT $2 OFFSET $3`,
		query, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []PublicServerResult
	for rows.Next() {
		var r PublicServerResult
		if err := rows.Scan(&r.ID, &r.Name, &r.IconURL, &r.Description, &r.MemberCount, &r.IsPublic); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	if results == nil {
		results = []PublicServerResult{}
	}
	return results, rows.Err()
}
