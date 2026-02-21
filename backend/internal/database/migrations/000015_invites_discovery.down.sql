DROP TABLE IF EXISTS server_invites;

ALTER TABLE servers DROP COLUMN IF EXISTS is_public;
ALTER TABLE servers DROP COLUMN IF EXISTS description;
