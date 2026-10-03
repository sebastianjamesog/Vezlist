package cc.vezlist.listings.persistence;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import cc.vezlist.shared.domain.SiteScope;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ListingViewRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public ListingViewRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean insert(UUID listingId, SiteScope site, UUID requestId, UUID viewerId) {
        var parameters = new MapSqlParameterSource()
                .addValue("listingId", listingId)
                .addValue("site", site.name())
                .addValue("requestId", requestId)
                .addValue("viewerId", viewerId)
                .addValue("anonymousHash", viewerId == null ? requestId.toString() : null);
        return !jdbc.query("""
                INSERT INTO listing_views (id, listing_id, viewer_id, anonymous_viewer_hash)
                SELECT :requestId, listing.id, :viewerId, :anonymousHash
                FROM listings listing
                JOIN app_users seller ON seller.id = listing.owner_id AND seller.enabled = TRUE
                WHERE listing.id = :listingId AND listing.site_scope = :site
                  AND listing.status = 'ACTIVE'
                  AND (listing.expires_at IS NULL OR listing.expires_at > now())
                ON CONFLICT (id) DO NOTHING
                RETURNING id
                """, parameters, (rs, row) -> rs.getObject("id", UUID.class)).isEmpty();
    }

    public Long increment(UUID listingId, SiteScope site) {
        var parameters = new MapSqlParameterSource()
                .addValue("listingId", listingId)
                .addValue("site", site.name());
        List<Long> counts = jdbc.query("""
                UPDATE listings listing SET view_count = listing.view_count + 1
                FROM app_users seller
                WHERE listing.id = :listingId AND listing.site_scope = :site
                  AND listing.owner_id = seller.id AND seller.enabled = TRUE
                  AND listing.status = 'ACTIVE'
                  AND (listing.expires_at IS NULL OR listing.expires_at > now())
                RETURNING listing.view_count
                """, parameters, (rs, row) -> rs.getLong("view_count"));
        return counts.isEmpty() ? null : counts.getFirst();
    }

    public Long activeCount(UUID listingId, SiteScope site) {
        var parameters = new MapSqlParameterSource()
                .addValue("listingId", listingId)
                .addValue("site", site.name());
        List<Long> counts = jdbc.query("""
                SELECT listing.view_count
                FROM listings listing
                JOIN app_users seller ON seller.id = listing.owner_id AND seller.enabled = TRUE
                WHERE listing.id = :listingId AND listing.site_scope = :site
                  AND listing.status = 'ACTIVE'
                  AND (listing.expires_at IS NULL OR listing.expires_at > now())
                """, parameters, (rs, row) -> rs.getLong("view_count"));
        return counts.isEmpty() ? null : counts.getFirst();
    }

    public Map<UUID, Long> activeCounts(List<UUID> listingIds, SiteScope site) {
        var parameters = new MapSqlParameterSource()
                .addValue("listingIds", listingIds)
                .addValue("site", site.name());
        Map<UUID, Long> counts = new LinkedHashMap<>();
        jdbc.query("""
                SELECT listing.id, listing.view_count
                FROM listings listing
                JOIN app_users seller ON seller.id = listing.owner_id AND seller.enabled = TRUE
                WHERE listing.id IN (:listingIds) AND listing.site_scope = :site
                  AND listing.status = 'ACTIVE'
                  AND (listing.expires_at IS NULL OR listing.expires_at > now())
                """, parameters, (rs, row) -> Map.entry(
                rs.getObject("id", UUID.class), rs.getLong("view_count")))
                .forEach(entry -> counts.put(entry.getKey(), entry.getValue()));
        return counts;
    }
}
