CREATE TABLE message_edits (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    edited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_message_edits_message_id ON message_edits(message_id);

CREATE TABLE link_previews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url         TEXT NOT NULL UNIQUE,
    title       TEXT,
    description TEXT,
    image_url   TEXT,
    site_name   TEXT,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
