ALTER TABLE servers DROP COLUMN IF EXISTS default_message_retention_days;
ALTER TABLE channels DROP COLUMN IF EXISTS message_retention_days;
ALTER TABLE attachments DROP COLUMN IF EXISTS encrypted_metadata;
DROP TABLE IF EXISTS dm_key_distributions;
DROP TABLE IF EXISTS user_key_envelopes;
ALTER TABLE dm_conversations DROP COLUMN IF EXISTS encrypted;
DROP TABLE IF EXISTS user_identity_keys;
