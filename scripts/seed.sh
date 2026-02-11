#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://thicket:thicket_dev@localhost:5432/thicket?sslmode=disable}"

echo "Seeding database..."

psql "$DATABASE_URL" <<'SQL'
-- Insert test users (password is "password123" bcrypt hashed)
INSERT INTO users (id, username, email, password_hash, display_name, status)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'netrunner', 'netrunner@thicket.app',
   '$2a$12$LJ3m4ys3Sz8n.pSPT4l3/.yU8q3MwjW3GZfO5l3X0Q4n3B8K3e5DW', 'NetRunner', 'online'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'cyberghost', 'cyberghost@thicket.app',
   '$2a$12$LJ3m4ys3Sz8n.pSPT4l3/.yU8q3MwjW3GZfO5l3X0Q4n3B8K3e5DW', 'CyberGhost', 'online')
ON CONFLICT (id) DO NOTHING;

-- Insert test server
INSERT INTO servers (id, name, owner_id, invite_code)
VALUES
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Night City Hub',
   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'nightcity')
ON CONFLICT (id) DO NOTHING;

-- Add members
INSERT INTO server_members (server_id, user_id, role)
VALUES
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'owner'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'member')
ON CONFLICT DO NOTHING;

-- Insert channels
INSERT INTO channels (id, server_id, name, type, position)
VALUES
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'general', 'text', 0),
  ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'voice-lounge', 'voice', 1)
ON CONFLICT (id) DO NOTHING;
SQL

echo "Seed complete!"
