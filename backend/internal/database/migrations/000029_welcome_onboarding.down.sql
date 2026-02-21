DROP TABLE IF EXISTS user_onboarding_completed;
DROP TABLE IF EXISTS onboarding_options;
DROP TABLE IF EXISTS onboarding_prompts;
ALTER TABLE servers DROP COLUMN IF EXISTS welcome_channels;
ALTER TABLE servers DROP COLUMN IF EXISTS welcome_message;
