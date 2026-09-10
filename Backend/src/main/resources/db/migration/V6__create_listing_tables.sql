ALTER TABLE categories
    ADD CONSTRAINT uq_categories_id_scope UNIQUE (id, site_scope);

CREATE TABLE listings (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES app_users (id),
    site_scope VARCHAR(20) NOT NULL,
    status VARCHAR(24) NOT NULL,
    title VARCHAR(70) NOT NULL,
    business_name VARCHAR(120) NOT NULL,
    description VARCHAR(5000) NOT NULL,
    price NUMERIC(12, 2),
    category_id VARCHAR(80) NOT NULL,
    province_id VARCHAR(40) NOT NULL REFERENCES locations (id),
    location_id VARCHAR(40) NOT NULL REFERENCES locations (id),
    contact_email VARCHAR(320) NOT NULL,
    contact_phone VARCHAR(32) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    coordinates GEOGRAPHY(POINT, 4326),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_listings_category_scope
        FOREIGN KEY (category_id, site_scope) REFERENCES categories (id, site_scope),
    CONSTRAINT chk_listings_site_scope CHECK (site_scope IN ('MARKETPLACE', 'PERSONALS')),
    CONSTRAINT chk_listings_status CHECK (
        status IN ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'EXPIRED', 'DELETED')
    ),
    CONSTRAINT chk_listings_price CHECK (price IS NULL OR price >= 0),
    CONSTRAINT chk_listings_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    )
);

CREATE INDEX idx_listings_owner_updated ON listings (owner_id, updated_at DESC);
CREATE INDEX idx_listings_scope_status_created ON listings (site_scope, status, created_at DESC);
CREATE INDEX idx_listings_category_status ON listings (category_id, status);
CREATE INDEX idx_listings_location_status ON listings (location_id, status);
CREATE INDEX idx_listings_coordinates ON listings USING GIST (coordinates);

CREATE FUNCTION vezlist_set_listing_coordinates() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.coordinates = CASE
        WHEN NEW.latitude IS NULL OR NEW.longitude IS NULL THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::GEOGRAPHY
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_coordinates
    BEFORE INSERT OR UPDATE OF latitude, longitude ON listings
    FOR EACH ROW EXECUTE FUNCTION vezlist_set_listing_coordinates();

CREATE TABLE listing_attributes (
    listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
    attribute_key VARCHAR(80) NOT NULL,
    attribute_value VARCHAR(500) NOT NULL,
    PRIMARY KEY (listing_id, attribute_key)
);

CREATE TABLE listing_views (
    id UUID PRIMARY KEY,
    listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES app_users (id) ON DELETE SET NULL,
    anonymous_viewer_hash VARCHAR(128),
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_listing_view_identity CHECK (
        viewer_id IS NOT NULL OR anonymous_viewer_hash IS NOT NULL
    )
);

CREATE INDEX idx_listing_views_listing_time ON listing_views (listing_id, viewed_at DESC);

CREATE TABLE listing_idempotency_keys (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    operation VARCHAR(24) NOT NULL,
    idempotency_key VARCHAR(160) NOT NULL,
    request_fingerprint VARCHAR(64) NOT NULL,
    listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_listing_idempotency UNIQUE (owner_id, operation, idempotency_key),
    CONSTRAINT chk_listing_idempotency_operation CHECK (operation IN ('CREATE', 'SUBMIT'))
);

CREATE TABLE listing_events (
    id UUID PRIMARY KEY,
    listing_id UUID NOT NULL REFERENCES listings (id),
    event_type VARCHAR(40) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    CONSTRAINT chk_listing_event_type CHECK (
        event_type IN ('LISTING_CREATED', 'LISTING_UPDATED', 'LISTING_SUBMITTED', 'LISTING_DELETED')
    )
);

CREATE INDEX idx_listing_events_pending
    ON listing_events (occurred_at) WHERE processed_at IS NULL;
