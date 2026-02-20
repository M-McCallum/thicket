ALTER TABLE users
    ADD COLUMN bio TEXT NOT NULL DEFAULT '',
    ADD COLUMN pronouns VARCHAR(50) NOT NULL DEFAULT '',
    ADD COLUMN custom_status_text VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN custom_status_emoji VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN custom_status_expires_at TIMESTAMPTZ;
