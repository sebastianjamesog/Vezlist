CREATE TABLE featured_slots (
    window_start TIMESTAMPTZ NOT NULL,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    feed VARCHAR(24) NOT NULL CHECK (feed IN ('AVAILABLE_NOW', 'NEW_TODAY', 'TRENDING')),
    score DOUBLE PRECISION NOT NULL,
    selected BOOLEAN NOT NULL,
    PRIMARY KEY (window_start, listing_id)
);

CREATE INDEX idx_featured_slots_feed_window ON featured_slots(feed, window_start DESC, selected, score DESC);
CREATE INDEX idx_featured_slots_exposure ON featured_slots(listing_id, window_start DESC) WHERE selected = TRUE;
CREATE INDEX idx_saved_listings_recent ON saved_listings(saved_at DESC, listing_id);
