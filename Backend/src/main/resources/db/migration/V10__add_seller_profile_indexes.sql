CREATE INDEX idx_listings_seller_active
    ON listings (owner_id, site_scope, COALESCE(published_at, created_at) DESC, id DESC)
    WHERE status = 'ACTIVE';
