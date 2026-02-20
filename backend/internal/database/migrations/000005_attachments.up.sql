CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    dm_message_id UUID REFERENCES dm_messages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    width INT,
    height INT,
    object_key TEXT NOT NULL,
    is_external BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((message_id IS NOT NULL AND dm_message_id IS NULL)
        OR (message_id IS NULL AND dm_message_id IS NOT NULL))
);
CREATE INDEX idx_attachments_message_id ON attachments(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_attachments_dm_message_id ON attachments(dm_message_id) WHERE dm_message_id IS NOT NULL;
