CREATE TABLE automod_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'keyword', 'regex', 'spam', 'invite_links', 'mention_spam'
  trigger_data JSONB NOT NULL DEFAULT '{}',
  action TEXT NOT NULL, -- 'delete', 'timeout', 'alert'
  action_metadata JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  exempt_roles UUID[] NOT NULL DEFAULT '{}',
  exempt_channels UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automod_rules_server ON automod_rules(server_id);
