package cc.vezlist.listings.persistence;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Writes rows into {@code listing_views} (V6). One row per viewer per listing
 * per rolling day: a reload, a React double-render or a back-and-forth between
 * the feed and the ad does not inflate the count a creator is ranked by.
 */
@Repository
public class ListingViewRepository {
    private final JdbcTemplate jdbc;

    public ListingViewRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Exactly one of {@code viewerId} / {@code anonymousHash} is non-null. */
    public void recordIfNew(UUID listingId, UUID viewerId, String anonymousHash) {
        jdbc.update("""
                INSERT INTO listing_views (id, listing_id, viewer_id, anonymous_viewer_hash)
                SELECT ?, ?, ?, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM listing_views v
                    WHERE v.listing_id = ?
                      AND v.viewed_at > now() - INTERVAL '1 day'
                      AND (v.viewer_id = ? OR v.anonymous_viewer_hash = ?))
                """, UUID.randomUUID(), listingId, viewerId, anonymousHash,
                listingId, viewerId, anonymousHash);
    }
}
