ALTER TABLE users
    DROP COLUMN IF EXISTS bio,
    DROP COLUMN IF EXISTS pronouns,
    DROP COLUMN IF EXISTS custom_status_text,
    DROP COLUMN IF EXISTS custom_status_emoji,
    DROP COLUMN IF EXISTS custom_status_expires_at;
