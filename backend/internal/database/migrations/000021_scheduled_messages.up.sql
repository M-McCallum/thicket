CREATE TABLE scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  dm_conversation_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (channel_id IS NOT NULL OR dm_conversation_id IS NOT NULL)
);
CREATE INDEX idx_scheduled_messages_due ON scheduled_messages (scheduled_at) WHERE sent = FALSE;
