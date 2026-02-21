CREATE TABLE pending_uploads (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_key   TEXT NOT NULL,
    upload_id    TEXT NOT NULL,
    filename     TEXT NOT NULL,
    content_type TEXT NOT NULL,
    file_size    BIGINT NOT NULL,
    parts_json   JSONB NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '2 hours'
);
CREATE INDEX idx_pending_uploads_user ON pending_uploads(user_id);
CREATE INDEX idx_pending_uploads_expires ON pending_uploads(expires_at);
