CREATE TABLE sticker_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(64) NOT NULL,
    description TEXT,
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE stickers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id UUID NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
    name VARCHAR(32) NOT NULL,
    object_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE messages ADD COLUMN type VARCHAR(10) NOT NULL DEFAULT 'text';
ALTER TABLE dm_messages ADD COLUMN type VARCHAR(10) NOT NULL DEFAULT 'text';
