CREATE TABLE soundboard_sounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    object_key TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    duration_ms INT NOT NULL DEFAULT 0,
    creator_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_soundboard_sounds_server ON soundboard_sounds(server_id);
