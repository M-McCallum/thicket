ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_announcement BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS channel_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    target_channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_channel_id, target_channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_follows_source ON channel_follows(source_channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_follows_target ON channel_follows(target_channel_id);
