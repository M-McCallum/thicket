-- Roles table
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    color       VARCHAR(7),
    position    INTEGER NOT NULL DEFAULT 0,
    permissions BIGINT NOT NULL DEFAULT 0,
    hoist       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_roles_server_id ON roles(server_id);

-- Member roles (join table)
CREATE TABLE member_roles (
    server_id UUID NOT NULL,
    user_id   UUID NOT NULL,
    role_id   UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, user_id, role_id),
    FOREIGN KEY (server_id, user_id) REFERENCES server_members(server_id, user_id) ON DELETE CASCADE
);

-- Channel permission overrides
CREATE TABLE channel_permission_overrides (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    allow      BIGINT NOT NULL DEFAULT 0,
    deny       BIGINT NOT NULL DEFAULT 0,
    UNIQUE (channel_id, role_id)
);

-- Data migration: create @everyone and Admin roles for existing servers,
-- migrate existing admin members to the Admin role.
DO $$
DECLARE
    srv RECORD;
    everyone_role_id UUID;
    admin_role_id UUID;
    member RECORD;
BEGIN
    FOR srv IN SELECT id FROM servers LOOP
        -- Create @everyone role (position 0) with default perms:
        -- VIEW_CHANNELS(1) | SEND_MESSAGES(2) | ADD_REACTIONS(256) | ATTACH_FILES(512) | VOICE_CONNECT(8192) | VOICE_SPEAK(16384) = 25347
        INSERT INTO roles (server_id, name, position, permissions)
        VALUES (srv.id, '@everyone', 0, 25347)
        RETURNING id INTO everyone_role_id;

        -- Create Admin role (position 1) with elevated perms:
        -- ADMINISTRATOR bit = 1073741824
        INSERT INTO roles (server_id, name, color, position, permissions, hoist)
        VALUES (srv.id, 'Admin', '#dc322f', 1, 1073741824, TRUE)
        RETURNING id INTO admin_role_id;

        -- Migrate existing admins to the Admin role
        FOR member IN SELECT server_id, user_id FROM server_members WHERE server_id = srv.id AND role = 'admin' LOOP
            INSERT INTO member_roles (server_id, user_id, role_id)
            VALUES (member.server_id, member.user_id, admin_role_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
