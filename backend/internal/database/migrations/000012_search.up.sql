ALTER TABLE messages ADD COLUMN search_vec tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX idx_messages_search ON messages USING GIN(search_vec);

ALTER TABLE dm_messages ADD COLUMN search_vec tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX idx_dm_messages_search ON dm_messages USING GIN(search_vec);
