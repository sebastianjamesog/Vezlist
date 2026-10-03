ALTER TABLE listings ADD COLUMN view_count BIGINT NOT NULL DEFAULT 0;

UPDATE listings listing
SET view_count = views.total
FROM (
    SELECT listing_id, COUNT(*) AS total
    FROM listing_views
    GROUP BY listing_id
) views
WHERE listing.id = views.listing_id;
