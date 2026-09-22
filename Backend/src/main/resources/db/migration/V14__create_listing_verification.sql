-- Per-listing ad verification: a seller proves control of a specific listing by
-- photographing a server-issued code, staff review the photo against the code,
-- and approval flips `listings.verified` for that listing only. This is
-- deliberately independent of `app_users.seller_verified` (an existing, unused
-- seller-level flag) and of the moderation_cases system: moderation enforces
-- exactly one OPEN case per listing across all kinds (uq_moderation_open_listing)
-- and its decide()/approve() flow encodes SUBMISSION/APPEAL-only state rules
-- (PENDING_REVIEW-only approval, image-ready gating, multi-approver policy).
-- Folding verification in there would block a listing from being reportable
-- while a verification request is open (and vice versa), and would require
-- bolting verification-only branches onto that shared state machine. A small
-- parallel table with its own single-decision review flow avoids both risks.

ALTER TABLE listings ADD COLUMN verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE listing_verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES app_users(id),
    code VARCHAR(6) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AWAITING_PHOTO'
        CHECK (status IN ('AWAITING_PHOTO', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),

    photo_object_key VARCHAR(320),
    photo_original_filename VARCHAR(255),
    photo_content_type VARCHAR(40),
    photo_size_bytes BIGINT,
    photo_checksum_sha256 VARCHAR(64),
    photo_status VARCHAR(20) NOT NULL DEFAULT 'NONE'
        CHECK (photo_status IN ('NONE', 'UPLOADING', 'PROCESSING', 'READY', 'REJECTED')),
    photo_upload_expires_at TIMESTAMPTZ,
    photo_rejection_reason VARCHAR(160),

    rejection_reason VARCHAR(300),
    submitted_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES app_users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one request in a non-terminal state per listing: this is what makes
-- "request verification twice while one is pending" a 409 rather than a race.
CREATE UNIQUE INDEX uq_listing_verification_open ON listing_verification_requests(listing_id)
    WHERE status IN ('AWAITING_PHOTO', 'PENDING_REVIEW');

CREATE INDEX idx_listing_verification_queue ON listing_verification_requests(submitted_at, id)
    WHERE status = 'PENDING_REVIEW';
CREATE INDEX idx_listing_verification_listing ON listing_verification_requests(listing_id, created_at DESC);
