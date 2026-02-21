DROP TABLE IF EXISTS dm_message_edits;
DROP TABLE IF EXISTS dm_pinned_messages;
DROP TABLE IF EXISTS dm_message_reactions;
ALTER TABLE dm_messages DROP COLUMN IF EXISTS reply_to_id;
