CREATE TABLE listing_media (
    id UUID PRIMARY KEY,
    listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
    object_key VARCHAR(320) NOT NULL UNIQUE,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(40) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    position INTEGER NOT NULL,
    upload_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ready_at TIMESTAMPTZ,
    rejection_reason VARCHAR(120),
    CONSTRAINT chk_listing_media_type
        CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT chk_listing_media_size CHECK (size_bytes > 0),
    CONSTRAINT chk_listing_media_checksum
        CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_listing_media_status
        CHECK (status IN ('UPLOADING', 'PROCESSING', 'READY', 'REJECTED')),
    CONSTRAINT chk_listing_media_position CHECK (position BETWEEN 0 AND 5)
);

CREATE INDEX idx_listing_media_listing_position
    ON listing_media (listing_id, position);
CREATE INDEX idx_listing_media_processing
    ON listing_media (updated_at)
    WHERE status = 'PROCESSING';
