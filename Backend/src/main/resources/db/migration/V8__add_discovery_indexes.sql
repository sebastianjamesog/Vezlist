CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE app_users
    ADD COLUMN seller_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_listings_discovery_newest
    ON listings (site_scope, COALESCE(published_at, created_at) DESC, id DESC)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_listings_discovery_price
    ON listings (site_scope, COALESCE(price, 0), COALESCE(published_at, created_at) DESC, id DESC)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_listings_discovery_category
    ON listings (site_scope, category_id, COALESCE(published_at, created_at) DESC, id DESC)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_listings_discovery_province
    ON listings (site_scope, province_id, COALESCE(published_at, created_at) DESC, id DESC)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_listings_discovery_area
    ON listings (site_scope, location_id, COALESCE(published_at, created_at) DESC, id DESC)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_listings_discovery_text
    ON listings USING GIN (
        ((title || ' ' || business_name || ' ' || description)) gin_trgm_ops
    )
    WHERE status = 'ACTIVE';

CREATE INDEX idx_listings_discovery_coordinates
    ON listings USING GIST (coordinates)
    WHERE status = 'ACTIVE' AND coordinates IS NOT NULL;

CREATE INDEX idx_app_users_verified
    ON app_users (seller_verified, id)
    WHERE enabled = TRUE;
