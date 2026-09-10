CREATE TABLE saved_listings (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_saved_listings_user_listing UNIQUE (user_id, listing_id)
);

CREATE INDEX idx_saved_listings_user_saved_at
    ON saved_listings (user_id, saved_at DESC, listing_id DESC);

CREATE INDEX idx_saved_listings_listing
    ON saved_listings (listing_id);

ALTER TABLE listings
    ADD COLUMN save_count BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_listings_save_count CHECK (save_count >= 0);

ALTER TABLE listing_events
    DROP CONSTRAINT chk_listing_event_type;

ALTER TABLE listing_events
    ADD CONSTRAINT chk_listing_event_type CHECK (
        event_type IN (
            'LISTING_CREATED',
            'LISTING_UPDATED',
            'LISTING_SUBMITTED',
            'LISTING_DELETED',
            'LISTING_SAVE_COUNT_CHANGED'
        )
    );
