-- Add welcome config to servers
ALTER TABLE servers ADD COLUMN IF NOT EXISTS welcome_message TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS welcome_channels UUID[] NOT NULL DEFAULT '{}';

-- Onboarding prompts
CREATE TABLE IF NOT EXISTS onboarding_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  required BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_prompts_server ON onboarding_prompts(server_id);

-- Onboarding options (choices within a prompt)
CREATE TABLE IF NOT EXISTS onboarding_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES onboarding_prompts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '',
  role_ids UUID[] NOT NULL DEFAULT '{}',
  channel_ids UUID[] NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_onboarding_options_prompt ON onboarding_options(prompt_id);

-- Track which users have completed onboarding per server
CREATE TABLE IF NOT EXISTS user_onboarding_completed (
  user_id UUID NOT NULL,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, server_id)
);
