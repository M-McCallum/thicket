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
		RETURNING id, name, icon_url, owner_id, invite_code, created_at, updated_at`,
		arg.Name, arg.OwnerID, arg.InviteCode,
	)
	return scanServer(row)
}

func (q *Queries) GetServerByID(ctx context.Context, id uuid.UUID) (Server, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, name, icon_url, owner_id, invite_code, created_at, updated_at
		FROM servers WHERE id = $1`, id,
	)
	return scanServer(row)
}

func (q *Queries) GetServerByInviteCode(ctx context.Context, inviteCode string) (Server, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, name, icon_url, owner_id, invite_code, created_at, updated_at
		FROM servers WHERE invite_code = $1`, inviteCode,
	)
	return scanServer(row)
}

func (q *Queries) GetUserServers(ctx context.Context, userID uuid.UUID) ([]Server, error) {
	rows, err := q.db.Query(ctx,
		`SELECT s.id, s.name, s.icon_url, s.owner_id, s.invite_code, s.created_at, s.updated_at
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
	ID      uuid.UUID
	Name    *string
	IconURL *string
}

func (q *Queries) UpdateServer(ctx context.Context, arg UpdateServerParams) (Server, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE servers SET name = COALESCE($2, name), icon_url = COALESCE($3, icon_url), updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, icon_url, owner_id, invite_code, created_at, updated_at`,
		arg.ID, arg.Name, arg.IconURL,
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

func (q *Queries) UpdateMemberRole(ctx context.Context, serverID, userID uuid.UUID, role string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE server_members SET role = $3 WHERE server_id = $1 AND user_id = $2`,
		serverID, userID, role,
	)
	return err
}

func scanServer(row pgx.Row) (Server, error) {
	var s Server
	err := row.Scan(&s.ID, &s.Name, &s.IconURL, &s.OwnerID, &s.InviteCode, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func scanServerFromRows(rows pgx.Rows) (Server, error) {
	var s Server
	err := rows.Scan(&s.ID, &s.Name, &s.IconURL, &s.OwnerID, &s.InviteCode, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}
