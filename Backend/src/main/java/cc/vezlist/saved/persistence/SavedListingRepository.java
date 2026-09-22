package cc.vezlist.saved.persistence;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import cc.vezlist.saved.application.SavedListingCursorCodec.CursorAnchor;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SavedListingRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public SavedListingRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public SaveAttempt saveActive(
            UUID savedListingId,
            UUID userId,
            UUID listingId,
            SiteScope site,
            Instant savedAt) {
        String sql = """
                WITH candidate AS MATERIALIZED (
                    SELECT l.id
                    FROM listings l
                    JOIN app_users seller ON seller.id = l.owner_id AND seller.enabled = TRUE
                    WHERE l.id = :listingId
                      AND l.site_scope = :site
                      AND l.status = 'ACTIVE'
                      AND (l.expires_at IS NULL OR l.expires_at > :savedAt)
                      AND l.owner_id <> :userId
                ), inserted AS (
                    INSERT INTO saved_listings (id, user_id, listing_id, saved_at)
                    SELECT :savedListingId, :userId, candidate.id, :savedAt
                    FROM candidate
                    ON CONFLICT (user_id, listing_id) DO NOTHING
                    RETURNING listing_id
                )
                SELECT EXISTS (SELECT 1 FROM candidate) AS accessible,
                       EXISTS (SELECT 1 FROM inserted) AS changed
                """;
        MapSqlParameterSource parameters = baseParameters(userId, listingId, site)
                .addValue("savedListingId", savedListingId)
                .addValue("savedAt", Timestamp.from(savedAt));
        return jdbc.queryForObject(sql, parameters, (rs, rowNumber) -> new SaveAttempt(
                rs.getBoolean("accessible"), rs.getBoolean("changed")));
    }

    public boolean delete(UUID userId, UUID listingId, SiteScope site) {
        String sql = """
                DELETE FROM saved_listings saved
                USING listings listing
                WHERE saved.user_id = :userId
                  AND saved.listing_id = :listingId
                  AND listing.id = saved.listing_id
                  AND listing.site_scope = :site
                RETURNING saved.listing_id
                """;
        return !jdbc.query(
                sql,
                baseParameters(userId, listingId, site),
                (rs, rowNumber) -> rs.getObject("listing_id", UUID.class)).isEmpty();
    }

    public boolean isSaveable(UUID userId, UUID listingId, SiteScope site, Instant asOf) {
        String sql = """
                SELECT EXISTS (
                    SELECT 1
                    FROM listings listing
                    JOIN app_users seller ON seller.id = listing.owner_id AND seller.enabled = TRUE
                    WHERE listing.id = :listingId
                      AND listing.site_scope = :site
                      AND listing.status = 'ACTIVE'
                      AND (listing.expires_at IS NULL OR listing.expires_at > :asOf)
                      AND listing.owner_id <> :userId
                )
                """;
        return Boolean.TRUE.equals(jdbc.queryForObject(
                sql,
                Map.of(
                        "userId", userId,
                        "listingId", listingId,
                        "site", site.name(),
                        "asOf", Timestamp.from(asOf)),
                Boolean.class));
    }

    public boolean isSaved(UUID userId, UUID listingId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                """
                        SELECT EXISTS (
                            SELECT 1 FROM saved_listings
                            WHERE user_id = :userId AND listing_id = :listingId
                        )
                        """,
                Map.of("userId", userId, "listingId", listingId),
                Boolean.class));
    }

    public long countAccessible(UUID userId, SiteScope site, Instant asOf) {
        Long count = jdbc.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM saved_listings saved
                        JOIN listings listing ON listing.id = saved.listing_id
                        JOIN app_users seller ON seller.id = listing.owner_id AND seller.enabled = TRUE
                        WHERE saved.user_id = :userId
                          AND saved.saved_at <= :asOf
                          AND listing.site_scope = :site
                          AND listing.status = 'ACTIVE'
                          AND (listing.expires_at IS NULL OR listing.expires_at > :asOf)
                          AND listing.owner_id <> :userId
                        """,
                new MapSqlParameterSource()
                        .addValue("userId", userId)
                        .addValue("site", site.name())
                        .addValue("asOf", Timestamp.from(asOf)),
                Long.class);
        return count == null ? 0 : count;
    }

    public List<SavedListingRow> findPage(
            UUID userId,
            SiteScope site,
            Instant asOf,
            CursorAnchor cursor,
            int fetchLimit) {
        StringBuilder sql = new StringBuilder("""
                SELECT listing.id,
                       listing.site_scope,
                       listing.title,
                       listing.business_name,
                       listing.price,
                       listing.category_id,
                       category.label AS category_label,
                       listing.province_id,
                       province.label AS province_label,
                       listing.location_id,
                       area.label AS location_label,
                       listing.verified AS verified,
                       COALESCE(listing.published_at, listing.created_at) AS published_at,
                       saved.saved_at,
                       (SELECT media.object_key
                        FROM listing_media media
                        WHERE media.listing_id = listing.id AND media.status = 'READY'
                        ORDER BY media.position ASC, media.created_at ASC
                        LIMIT 1) AS cover_object_key,
                       (SELECT COUNT(*)
                        FROM listing_media media
                        WHERE media.listing_id = listing.id AND media.status = 'READY') AS photo_count
                FROM saved_listings saved
                JOIN listings listing ON listing.id = saved.listing_id
                JOIN app_users seller ON seller.id = listing.owner_id AND seller.enabled = TRUE
                JOIN categories category ON category.id = listing.category_id
                JOIN locations area ON area.id = listing.location_id
                JOIN locations province ON province.id = listing.province_id
                WHERE saved.user_id = :userId
                  AND saved.saved_at <= :asOf
                  AND listing.site_scope = :site
                  AND listing.status = 'ACTIVE'
                  AND (listing.expires_at IS NULL OR listing.expires_at > :asOf)
                  AND listing.owner_id <> :userId
                """);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("site", site.name())
                .addValue("asOf", Timestamp.from(asOf))
                .addValue("fetchLimit", fetchLimit);
        if (cursor != null) {
            sql.append("""
                      AND (saved.saved_at < :cursorSavedAt
                           OR (saved.saved_at = :cursorSavedAt AND listing.id < :cursorListingId))
                    """);
            parameters
                    .addValue("cursorSavedAt", Timestamp.from(cursor.savedAt()))
                    .addValue("cursorListingId", cursor.listingId());
        }
        sql.append(" ORDER BY saved.saved_at DESC, listing.id DESC LIMIT :fetchLimit");
        return jdbc.query(sql.toString(), parameters, new SavedListingRowMapper());
    }

    public void changeListingSaveCount(UUID listingId, int delta) {
        int updated = jdbc.update(
                """
                        UPDATE listings
                        SET save_count = GREATEST(save_count + :delta, 0),
                            version = version + 1
                        WHERE id = :listingId
                        """,
                Map.of("listingId", listingId, "delta", delta));
        if (updated != 1) {
            throw new IllegalStateException("Could not update the listing save count.");
        }
    }

    private MapSqlParameterSource baseParameters(UUID userId, UUID listingId, SiteScope site) {
        return new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("listingId", listingId)
                .addValue("site", site.name());
    }

    public record SaveAttempt(boolean accessible, boolean changed) {
    }

    public record SavedListingRow(
            UUID id,
            SiteScope site,
            String title,
            String businessName,
            BigDecimal price,
            String categoryId,
            String categoryLabel,
            String provinceId,
            String provinceLabel,
            String locationId,
            String locationLabel,
            boolean verified,
            String coverObjectKey,
            int photoCount,
            Instant publishedAt,
            Instant savedAt) {

        public CursorAnchor cursorAnchor() {
            return new CursorAnchor(savedAt, id);
        }
    }

    private static final class SavedListingRowMapper implements RowMapper<SavedListingRow> {
        @Override
        public SavedListingRow mapRow(ResultSet rs, int rowNumber) throws SQLException {
            return new SavedListingRow(
                    rs.getObject("id", UUID.class),
                    SiteScope.valueOf(rs.getString("site_scope")),
                    rs.getString("title"),
                    rs.getString("business_name"),
                    rs.getBigDecimal("price"),
                    rs.getString("category_id"),
                    rs.getString("category_label"),
                    rs.getString("province_id"),
                    rs.getString("province_label"),
                    rs.getString("location_id"),
                    rs.getString("location_label"),
                    rs.getBoolean("verified"),
                    rs.getString("cover_object_key"),
                    rs.getInt("photo_count"),
                    rs.getTimestamp("published_at").toInstant(),
                    rs.getTimestamp("saved_at").toInstant());
        }
    }
}
