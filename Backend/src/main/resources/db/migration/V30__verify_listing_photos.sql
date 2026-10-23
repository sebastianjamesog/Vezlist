-- Verification belongs to the exact reviewed photo, never every photo owned by a verified advertiser.
-- Existing rows deliberately remain unverified until explicitly selected by staff.
ALTER TABLE listing_media ADD COLUMN verified_checksum_sha256 VARCHAR(64);
