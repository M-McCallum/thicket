CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    parent_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    creator_id UUID NOT NULL REFERENCES users(id),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    auto_archive_minutes INT NOT NULL DEFAULT 4320,
    message_count INT NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE thread_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    reply_to_id UUID REFERENCES thread_messages(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE thread_subscriptions (
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_level TEXT NOT NULL DEFAULT 'all',
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX idx_threads_channel ON threads(channel_id);
CREATE INDEX idx_threads_parent_message ON threads(parent_message_id);
CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id, created_at);
