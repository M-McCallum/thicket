CREATE TABLE server_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location_type TEXT NOT NULL DEFAULT 'voice',
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    external_location TEXT NOT NULL DEFAULT '',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_rsvps (
    event_id UUID NOT NULL REFERENCES server_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'interested',
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX idx_server_events_server_id ON server_events(server_id);
CREATE INDEX idx_server_events_start_time ON server_events(start_time);
CREATE INDEX idx_event_rsvps_event_id ON event_rsvps(event_id);
