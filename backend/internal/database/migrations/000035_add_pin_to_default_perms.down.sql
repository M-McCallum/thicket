-- Remove PermPinMessages (4096) from @everyone roles
UPDATE roles
SET permissions = permissions & ~4096
WHERE name = '@everyone' AND position = 0 AND (permissions & 4096) != 0;
