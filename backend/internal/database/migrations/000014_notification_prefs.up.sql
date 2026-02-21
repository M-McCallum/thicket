CREATE TABLE notification_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type VARCHAR(10) NOT NULL,
  scope_id UUID NOT NULL,
  setting VARCHAR(20) NOT NULL,
  PRIMARY KEY (user_id, scope_type, scope_id)
);
