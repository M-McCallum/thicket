DROP INDEX IF EXISTS idx_message_reactions_message_id;
DROP TABLE IF EXISTS message_reactions;
DROP TABLE IF EXISTS pinned_messages;
ALTER TABLE messages DROP COLUMN IF EXISTS reply_to_id;
ALTER TABLE channels DROP COLUMN IF EXISTS category_id;
ALTER TABLE channels DROP COLUMN IF EXISTS topic;
DROP TABLE IF EXISTS channel_categories;
