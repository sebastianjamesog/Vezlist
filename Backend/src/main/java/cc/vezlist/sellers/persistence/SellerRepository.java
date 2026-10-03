package cc.vezlist.sellers.persistence;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import cc.vezlist.shared.domain.SiteScope;

@Repository
public class SellerRepository {
    private final JdbcTemplate jdbc;
    public SellerRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public SellerRow findPublicSeller(UUID sellerId, SiteScope site) {
        List<SellerRow> rows = jdbc.query("""
                SELECT u.id, u.display_name, p.avatar_url, u.created_at, u.seller_verified,
                       COUNT(l.id) AS active_listing_count
                FROM app_users u
                LEFT JOIN user_profiles p ON p.user_id = u.id
                LEFT JOIN listings l ON l.owner_id = u.id
                    AND l.site_scope = ? AND l.status = 'ACTIVE'
                    AND (l.expires_at IS NULL OR l.expires_at > now())
                WHERE u.id = ? AND u.enabled = TRUE
                GROUP BY u.id, u.display_name, p.avatar_url, u.created_at, u.seller_verified
                """, new SellerRowMapper(), site.name(), sellerId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public List<ListingRow> findActiveListings(UUID sellerId, SiteScope site, int limit) {
        return jdbc.query("""
                SELECT l.id, l.site_scope, l.title, l.business_name, l.price,
                       l.category_id, c.label AS category_label, l.province_id,
                       p.label AS province_label, l.location_id, a.label AS location_label,
                       u.seller_verified AS verified, l.view_count,
                       (SELECT lm.object_key FROM listing_media lm WHERE lm.listing_id = l.id
                        AND lm.status = 'READY' ORDER BY lm.position ASC, lm.created_at ASC LIMIT 1) AS cover_object_key,
                       (SELECT COUNT(*) FROM listing_media lm WHERE lm.listing_id = l.id
                        AND lm.status = 'READY') AS photo_count,
                       COALESCE(l.published_at, l.created_at) AS published_at
                FROM listings l JOIN app_users u ON u.id = l.owner_id AND u.enabled = TRUE
                JOIN categories c ON c.id = l.category_id JOIN locations a ON a.id = l.location_id
                JOIN locations p ON p.id = l.province_id
                WHERE l.owner_id = ? AND l.site_scope = ? AND l.status = 'ACTIVE'
                  AND (l.expires_at IS NULL OR l.expires_at > now())
                ORDER BY COALESCE(l.published_at, l.created_at) DESC, l.id DESC LIMIT ?
                """, new ListingRowMapper(), sellerId, site.name(), limit);
    }

    public record SellerRow(UUID id, String displayName, String avatarUrl, Instant memberSince,
                            boolean verified, long activeListingCount) { }
    public record ListingRow(UUID id, SiteScope site, String title, String businessName, BigDecimal price,
                             String categoryId, String categoryLabel, String provinceId, String provinceLabel,
                             String locationId, String locationLabel, boolean verified, String coverObjectKey,
                             int photoCount, Instant publishedAt, long viewCount) { }
    private static final class SellerRowMapper implements RowMapper<SellerRow> {
        @Override public SellerRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new SellerRow(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("avatar_url"),
                    rs.getTimestamp("created_at").toInstant(), rs.getBoolean("seller_verified"), rs.getLong("active_listing_count"));
        }
    }
    private static final class ListingRowMapper implements RowMapper<ListingRow> {
        @Override public ListingRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new ListingRow(rs.getObject("id", UUID.class), SiteScope.valueOf(rs.getString("site_scope")),
                    rs.getString("title"), rs.getString("business_name"), rs.getBigDecimal("price"), rs.getString("category_id"),
                    rs.getString("category_label"), rs.getString("province_id"), rs.getString("province_label"),
                    rs.getString("location_id"), rs.getString("location_label"), rs.getBoolean("verified"),
                    rs.getString("cover_object_key"), rs.getInt("photo_count"),
                    rs.getTimestamp("published_at").toInstant(), rs.getLong("view_count"));
        }
    }
}
