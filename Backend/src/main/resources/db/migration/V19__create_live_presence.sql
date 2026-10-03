CREATE TABLE live_presence (
    owner_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    title VARCHAR(80) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_presence_heartbeat ON live_presence(heartbeat_at DESC, owner_id);
