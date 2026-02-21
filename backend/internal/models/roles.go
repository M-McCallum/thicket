package models

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// CreateRoleParams holds parameters for creating a role.
type CreateRoleParams struct {
	ServerID    uuid.UUID
	Name        string
	Color       *string
	Position    int
	Permissions int64
	Hoist       bool
}

func (q *Queries) CreateRole(ctx context.Context, arg CreateRoleParams) (Role, error) {
	row := q.db.QueryRow(ctx,
		`INSERT INTO roles (server_id, name, color, position, permissions, hoist)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, server_id, name, color, position, permissions, hoist, created_at`,
		arg.ServerID, arg.Name, arg.Color, arg.Position, arg.Permissions, arg.Hoist,
	)
	return scanRole(row)
}

func (q *Queries) GetServerRoles(ctx context.Context, serverID uuid.UUID) ([]Role, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, server_id, name, color, position, permissions, hoist, created_at
		FROM roles WHERE server_id = $1 ORDER BY position ASC`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []Role
	for rows.Next() {
		r, err := scanRoleFromRows(rows)
		if err != nil {
			return nil, err
		}
		roles = append(roles, r)
	}
	if roles == nil {
		roles = []Role{}
	}
	return roles, rows.Err()
}

func (q *Queries) GetRoleByID(ctx context.Context, roleID uuid.UUID) (Role, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, server_id, name, color, position, permissions, hoist, created_at
		FROM roles WHERE id = $1`, roleID,
	)
	return scanRole(row)
}

func (q *Queries) GetEveryoneRole(ctx context.Context, serverID uuid.UUID) (Role, error) {
	row := q.db.QueryRow(ctx,
		`SELECT id, server_id, name, color, position, permissions, hoist, created_at
		FROM roles WHERE server_id = $1 AND name = '@everyone' AND position = 0`, serverID,
	)
	return scanRole(row)
}

type UpdateRoleParams struct {
	ID          uuid.UUID
	Name        *string
	Color       *string
	Permissions *int64
	Hoist       *bool
}

func (q *Queries) UpdateRole(ctx context.Context, arg UpdateRoleParams) (Role, error) {
	row := q.db.QueryRow(ctx,
		`UPDATE roles SET
			name = COALESCE($2, name),
			color = COALESCE($3, color),
			permissions = COALESCE($4, permissions),
			hoist = COALESCE($5, hoist)
		WHERE id = $1
		RETURNING id, server_id, name, color, position, permissions, hoist, created_at`,
		arg.ID, arg.Name, arg.Color, arg.Permissions, arg.Hoist,
	)
	return scanRole(row)
}

func (q *Queries) DeleteRole(ctx context.Context, roleID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM roles WHERE id = $1`, roleID)
	return err
}

func (q *Queries) ReorderRoles(ctx context.Context, serverID uuid.UUID, rolePositions []RolePosition) error {
	for _, rp := range rolePositions {
		_, err := q.db.Exec(ctx,
			`UPDATE roles SET position = $2 WHERE id = $1 AND server_id = $3`,
			rp.RoleID, rp.Position, serverID,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

// RolePosition is used for reorder requests.
type RolePosition struct {
	RoleID   uuid.UUID `json:"role_id"`
	Position int       `json:"position"`
}

// Member role operations

func (q *Queries) AssignRole(ctx context.Context, serverID, userID, roleID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO member_roles (server_id, user_id, role_id)
		VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		serverID, userID, roleID,
	)
	return err
}

func (q *Queries) RemoveRole(ctx context.Context, serverID, userID, roleID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM member_roles WHERE server_id = $1 AND user_id = $2 AND role_id = $3`,
		serverID, userID, roleID,
	)
	return err
}

func (q *Queries) GetMemberRoles(ctx context.Context, serverID, userID uuid.UUID) ([]Role, error) {
	rows, err := q.db.Query(ctx,
		`SELECT r.id, r.server_id, r.name, r.color, r.position, r.permissions, r.hoist, r.created_at
		FROM roles r JOIN member_roles mr ON r.id = mr.role_id
		WHERE mr.server_id = $1 AND mr.user_id = $2
		ORDER BY r.position DESC`, serverID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []Role
	for rows.Next() {
		r, err := scanRoleFromRows(rows)
		if err != nil {
			return nil, err
		}
		roles = append(roles, r)
	}
	if roles == nil {
		roles = []Role{}
	}
	return roles, rows.Err()
}

// GetMembersWithRoles returns all server members with their assigned roles.
func (q *Queries) GetMembersWithRoles(ctx context.Context, serverID uuid.UUID) ([]MemberWithRoles, error) {
	rows, err := q.db.Query(ctx,
		`SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, sm.role, sm.nickname,
			COALESCE(
				json_agg(json_build_object(
					'id', r.id, 'server_id', r.server_id, 'name', r.name,
					'color', r.color, 'position', r.position, 'permissions', r.permissions,
					'hoist', r.hoist, 'created_at', r.created_at
				)) FILTER (WHERE r.id IS NOT NULL), '[]'
			) as roles
		FROM server_members sm
		JOIN users u ON sm.user_id = u.id
		LEFT JOIN member_roles mr ON mr.server_id = sm.server_id AND mr.user_id = sm.user_id
		LEFT JOIN roles r ON r.id = mr.role_id
		WHERE sm.server_id = $1
		GROUP BY u.id, u.username, u.display_name, u.avatar_url, u.status, sm.role, sm.nickname
		ORDER BY u.username`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []MemberWithRoles
	for rows.Next() {
		var m MemberWithRoles
		var rolesJSON []byte
		if err := rows.Scan(&m.ID, &m.Username, &m.DisplayName, &m.AvatarURL, &m.Status, &m.Role, &m.Nickname, &rolesJSON); err != nil {
			return nil, err
		}
		m.Roles = []Role{}
		if len(rolesJSON) > 2 {
			parsed, err := parseRolesJSON(rolesJSON)
			if err == nil {
				m.Roles = parsed
			}
		}
		members = append(members, m)
	}
	if members == nil {
		members = []MemberWithRoles{}
	}
	return members, rows.Err()
}

// Channel permission override operations

func (q *Queries) GetChannelOverrides(ctx context.Context, channelID uuid.UUID) ([]ChannelPermissionOverride, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, channel_id, role_id, allow, deny
		FROM channel_permission_overrides WHERE channel_id = $1`, channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var overrides []ChannelPermissionOverride
	for rows.Next() {
		var o ChannelPermissionOverride
		if err := rows.Scan(&o.ID, &o.ChannelID, &o.RoleID, &o.Allow, &o.Deny); err != nil {
			return nil, err
		}
		overrides = append(overrides, o)
	}
	if overrides == nil {
		overrides = []ChannelPermissionOverride{}
	}
	return overrides, rows.Err()
}

func (q *Queries) SetChannelOverride(ctx context.Context, channelID, roleID uuid.UUID, allow, deny int64) (ChannelPermissionOverride, error) {
	var o ChannelPermissionOverride
	err := q.db.QueryRow(ctx,
		`INSERT INTO channel_permission_overrides (channel_id, role_id, allow, deny)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (channel_id, role_id) DO UPDATE SET allow = $3, deny = $4
		RETURNING id, channel_id, role_id, allow, deny`,
		channelID, roleID, allow, deny,
	).Scan(&o.ID, &o.ChannelID, &o.RoleID, &o.Allow, &o.Deny)
	return o, err
}

func (q *Queries) DeleteChannelOverride(ctx context.Context, channelID, roleID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM channel_permission_overrides WHERE channel_id = $1 AND role_id = $2`,
		channelID, roleID,
	)
	return err
}

// CreateDefaultRoles creates @everyone role for a new server.
func (q *Queries) CreateDefaultRoles(ctx context.Context, serverID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO roles (server_id, name, position, permissions)
		VALUES ($1, '@everyone', 0, $2)`,
		serverID, PermAllDefault,
	)
	return err
}

// GetMaxRolePosition returns the highest role position for a server.
func (q *Queries) GetMaxRolePosition(ctx context.Context, serverID uuid.UUID) (int, error) {
	var pos int
	err := q.db.QueryRow(ctx,
		`SELECT COALESCE(MAX(position), 0) FROM roles WHERE server_id = $1`, serverID,
	).Scan(&pos)
	return pos, err
}

// Scanners

func scanRole(row pgx.Row) (Role, error) {
	var r Role
	err := row.Scan(&r.ID, &r.ServerID, &r.Name, &r.Color, &r.Position, &r.Permissions, &r.Hoist, &r.CreatedAt)
	return r, err
}

func scanRoleFromRows(rows pgx.Rows) (Role, error) {
	var r Role
	err := rows.Scan(&r.ID, &r.ServerID, &r.Name, &r.Color, &r.Position, &r.Permissions, &r.Hoist, &r.CreatedAt)
	return r, err
}

func parseRolesJSON(data []byte) ([]Role, error) {
	type roleJSON struct {
		ID          uuid.UUID `json:"id"`
		ServerID    uuid.UUID `json:"server_id"`
		Name        string    `json:"name"`
		Color       *string   `json:"color"`
		Position    int       `json:"position"`
		Permissions int64     `json:"permissions"`
		Hoist       bool      `json:"hoist"`
	}

	var rjs []roleJSON
	if err := json.Unmarshal(data, &rjs); err != nil {
		return nil, err
	}

	roles := make([]Role, len(rjs))
	for i, rj := range rjs {
		roles[i] = Role{
			ID:          rj.ID,
			ServerID:    rj.ServerID,
			Name:        rj.Name,
			Color:       rj.Color,
			Position:    rj.Position,
			Permissions: rj.Permissions,
			Hoist:       rj.Hoist,
		}
	}
	return roles, nil
}
