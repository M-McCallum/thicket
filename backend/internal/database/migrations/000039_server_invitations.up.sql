CREATE TABLE server_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(server_id, sender_id, recipient_id, status)
);
CREATE INDEX idx_server_invitations_recipient ON server_invitations(recipient_id, status);
CREATE INDEX idx_server_invitations_sender ON server_invitations(sender_id, status);
