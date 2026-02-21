ALTER TABLE dm_messages ADD COLUMN reply_to_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL;

CREATE TABLE dm_message_reactions (
    dm_message_id UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (dm_message_id, user_id, emoji)
);

CREATE TABLE dm_pinned_messages (
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    dm_message_id UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    pinned_by UUID NOT NULL REFERENCES users(id),
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, dm_message_id)
);

CREATE TABLE dm_message_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dm_message_id UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
