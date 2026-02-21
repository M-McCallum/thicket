-- E2EE identity keys: per-device key pairs for encrypted DMs
CREATE TABLE user_identity_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    public_key_jwk JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_user_identity_keys_user_device ON user_identity_keys(user_id, device_id);
CREATE INDEX idx_user_identity_keys_user ON user_identity_keys(user_id);

-- Track which DM conversations have E2EE enabled
ALTER TABLE dm_conversations ADD COLUMN encrypted BOOLEAN NOT NULL DEFAULT false;

-- Key envelopes for OPAQUE/passphrase-based key recovery
CREATE TABLE user_key_envelopes (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    envelope BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group DM key distribution (per-epoch symmetric key encrypted to each participant)
CREATE TABLE dm_key_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    epoch INT NOT NULL DEFAULT 1,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_key BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_dm_key_dist_conv_epoch_user ON dm_key_distributions(conversation_id, epoch, user_id);
CREATE INDEX idx_dm_key_dist_conv ON dm_key_distributions(conversation_id);

-- Encrypted file metadata
ALTER TABLE attachments ADD COLUMN encrypted_metadata JSONB;

-- Message retention policies
ALTER TABLE channels ADD COLUMN message_retention_days INT;
ALTER TABLE servers ADD COLUMN default_message_retention_days INT;
