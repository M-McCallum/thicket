DROP INDEX IF EXISTS idx_dm_messages_search;
ALTER TABLE dm_messages DROP COLUMN IF EXISTS search_vec;

DROP INDEX IF EXISTS idx_messages_search;
ALTER TABLE messages DROP COLUMN IF EXISTS search_vec;
