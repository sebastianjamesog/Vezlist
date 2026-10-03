package cc.vezlist.discovery.persistence;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import cc.vezlist.discovery.application.DiscoveryCriteria;
import cc.vezlist.discovery.application.DiscoveryCursorCodec.CursorAnchor;
import cc.vezlist.discovery.domain.DiscoverySort;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DiscoveryRepository {
    private static final String DISTANCE_SQL = """
            ST_Distance(
                l.coordinates,
                CAST(ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326) AS geography)
            ) / 1000.0
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final long queryTimeoutMs;

    public DiscoveryRepository(
            NamedParameterJdbcTemplate jdbc,
            @Value("${vezlist.discovery.query-timeout-ms:3000}") long queryTimeoutMs) {
        this.jdbc = jdbc;
        this.queryTimeoutMs = queryTimeoutMs;
    }

    public List<DiscoveryRow> search(DiscoveryCriteria criteria) {
        applyStatementTimeout();
        QueryParts parts = commonQuery(criteria, true);
        StringBuilder sql = new StringBuilder(parts.sql());
        appendCursor(sql, parts.parameters(), criteria.sort(), criteria.cursor());
        sql.append(orderBy(criteria.sort()));
        sql.append(" LIMIT :fetchLimit");
        parts.parameters().addValue("fetchLimit", criteria.limit() + 1);
        return jdbc.query(sql.toString(), parts.parameters(), new DiscoveryRowMapper());
    }

    public List<MapPinRow> mapPins(DiscoveryCriteria criteria) {
        applyStatementTimeout();
        QueryParts parts = commonQuery(criteria, false);
        String sql = parts.sql()
                + " ORDER BY distance_km ASC, id ASC LIMIT :fetchLimit";
        parts.parameters().addValue("fetchLimit", criteria.limit());
        return jdbc.query(sql, parts.parameters(), (rs, rowNumber) -> new MapPinRow(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getString("category_id"),
                rs.getBigDecimal("price"),
                rs.getDouble("latitude"),
                rs.getDouble("longitude"),
                rs.getDouble("distance_km"),
                rs.getBoolean("verified")));
    }

    private QueryParts commonQuery(DiscoveryCriteria criteria, boolean includeCardFields) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("site", criteria.site().name())
                .addValue("asOf", Timestamp.from(criteria.asOf()));
        String distance = criteria.hasCoordinates() ? DISTANCE_SQL : "CAST(NULL AS double precision)";
        if (criteria.hasCoordinates()) {
            parameters
                    .addValue("latitude", criteria.latitude())
                    .addValue("longitude", criteria.longitude())
                    .addValue("radiusMeters", criteria.radiusKm() * 1000.0);
        }

        StringBuilder sql = new StringBuilder("WITH candidates AS ( SELECT ")
                .append("l.id, l.site_scope, l.title, l.business_name, l.price, ")
                .append("l.category_id, l.province_id, l.location_id, l.latitude, l.longitude, ")
                .append("l.verified AS verified, l.view_count, ")
                .append("COALESCE(l.published_at, l.created_at) AS published_at, ")
                .append("COALESCE(l.price, 0) AS sort_price, ")
                .append(distance).append(" AS distance_km");

        if (includeCardFields) {
            sql.append(", c.label AS category_label, p.label AS province_label, a.label AS location_label, ")
                    .append("(SELECT lm.object_key FROM listing_media lm ")
                    .append(" WHERE lm.listing_id = l.id AND lm.status = 'READY' ")
                    .append(" ORDER BY lm.position ASC, lm.created_at ASC LIMIT 1) AS cover_object_key, ")
                    .append("(SELECT COUNT(*) FROM listing_media lm ")
                    .append(" WHERE lm.listing_id = l.id AND lm.status = 'READY') AS photo_count");
        }

        sql.append(" FROM listings l ")
                .append("JOIN app_users u ON u.id = l.owner_id AND u.enabled = TRUE ")
                .append("JOIN categories c ON c.id = l.category_id ")
                .append("JOIN locations a ON a.id = l.location_id ")
                .append("JOIN locations p ON p.id = l.province_id ")
                .append("WHERE l.site_scope = :site AND l.status = 'ACTIVE' ")
                .append("AND (l.expires_at IS NULL OR l.expires_at > :asOf) ");

        if (criteria.query() != null) {
            sql.append("AND (l.title || ' ' || l.business_name || ' ' || l.description) ")
                    .append("ILIKE :query ESCAPE E'\\\\' ");
            parameters.addValue("query", "%" + escapeLike(criteria.query()) + "%");
        }
        if (!criteria.categoryIds().isEmpty()) {
            sql.append("AND l.category_id IN (:categoryIds) ");
            parameters.addValue("categoryIds", criteria.categoryIds());
        }
        if (criteria.provinceId() != null) {
            sql.append("AND l.province_id = :provinceId ");
            parameters.addValue("provinceId", criteria.provinceId());
        }
        if (!criteria.areaIds().isEmpty()) {
            sql.append("AND l.location_id IN (:areaIds) ");
            parameters.addValue("areaIds", criteria.areaIds());
        }
        if (criteria.minPrice() != null) {
            sql.append("AND COALESCE(l.price, 0) >= :minPrice ");
            parameters.addValue("minPrice", criteria.minPrice());
        }
        if (criteria.maxPrice() != null) {
            sql.append("AND COALESCE(l.price, 0) <= :maxPrice ");
            parameters.addValue("maxPrice", criteria.maxPrice());
        }
        if (criteria.verifiedOnly()) {
            sql.append("AND l.verified = TRUE ");
        }
        if (criteria.availableOnly()) {
            sql.append("AND EXISTS (SELECT 1 FROM user_preferences up WHERE up.user_id = l.owner_id "
                    + "AND up.available_now = TRUE) ");
        }
        if (criteria.postedAfter() != null) {
            sql.append("AND COALESCE(l.published_at, l.created_at) >= :postedAfter ");
            parameters.addValue("postedAfter", Timestamp.from(criteria.postedAfter()));
        }
        if (criteria.hasCoordinates()) {
            sql.append("AND l.coordinates IS NOT NULL ")
                    .append("AND ST_DWithin(l.coordinates, ")
                    .append("CAST(ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326) AS geography), ")
                    .append(":radiusMeters) ");
        }
        sql.append(") SELECT * FROM candidates WHERE 1 = 1 ");
        return new QueryParts(sql.toString(), parameters);
    }

    private void appendCursor(
            StringBuilder sql,
            MapSqlParameterSource parameters,
            DiscoverySort sort,
            CursorAnchor cursor) {
        if (cursor == null) return;
        parameters
                .addValue("cursorPublishedAt", Timestamp.from(cursor.publishedAt()))
                .addValue("cursorId", cursor.id());
        switch (sort) {
            case NEWEST -> sql.append("AND (published_at < :cursorPublishedAt ")
                    .append("OR (published_at = :cursorPublishedAt AND id < :cursorId)) ");
            case PRICE_ASC -> {
                parameters.addValue("cursorPrice", cursor.price());
                sql.append("AND (sort_price > :cursorPrice ")
                        .append("OR (sort_price = :cursorPrice AND published_at < :cursorPublishedAt) ")
                        .append("OR (sort_price = :cursorPrice AND published_at = :cursorPublishedAt ")
                        .append("AND id < :cursorId)) ");
            }
            case PRICE_DESC -> {
                parameters.addValue("cursorPrice", cursor.price());
                sql.append("AND (sort_price < :cursorPrice ")
                        .append("OR (sort_price = :cursorPrice AND published_at < :cursorPublishedAt) ")
                        .append("OR (sort_price = :cursorPrice AND published_at = :cursorPublishedAt ")
                        .append("AND id < :cursorId)) ");
            }
            case NEAREST -> {
                parameters.addValue("cursorDistance", cursor.distanceKm());
                sql.append("AND (distance_km > :cursorDistance ")
                        .append("OR (distance_km = :cursorDistance AND id > :cursorId)) ");
            }
        }
    }

    private String orderBy(DiscoverySort sort) {
        return switch (sort) {
            case NEWEST -> " ORDER BY published_at DESC, id DESC";
            case PRICE_ASC -> " ORDER BY sort_price ASC, published_at DESC, id DESC";
            case PRICE_DESC -> " ORDER BY sort_price DESC, published_at DESC, id DESC";
            case NEAREST -> " ORDER BY distance_km ASC, id ASC";
        };
    }

    private String escapeLike(String value) {
        char escape = 92;
        return value
                .replace(String.valueOf(escape), String.valueOf(escape) + escape)
                .replace("%", escape + "%")
                .replace("_", escape + "_");
    }

    private void applyStatementTimeout() {
        jdbc.queryForObject(
                "SELECT set_config('statement_timeout', :timeout, true)",
                Map.of("timeout", queryTimeoutMs + "ms"),
                String.class);
    }

    private record QueryParts(String sql, MapSqlParameterSource parameters) {
    }

    public record DiscoveryRow(
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
            Double latitude,
            Double longitude,
            Double distanceKm,
            boolean verified,
            String coverObjectKey,
            int photoCount,
            Instant publishedAt,
            long viewCount,
            BigDecimal sortPrice) {

        public CursorAnchor cursorAnchor() {
            return new CursorAnchor(publishedAt, sortPrice, distanceKm, id);
        }
    }

    public record MapPinRow(
            UUID id,
            String title,
            String categoryId,
            BigDecimal price,
            double latitude,
            double longitude,
            double distanceKm,
            boolean verified) {
    }

    private static final class DiscoveryRowMapper implements RowMapper<DiscoveryRow> {
        @Override
        public DiscoveryRow mapRow(ResultSet rs, int rowNumber) throws SQLException {
            return new DiscoveryRow(
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
                    nullableDouble(rs, "latitude"),
                    nullableDouble(rs, "longitude"),
                    nullableDouble(rs, "distance_km"),
                    rs.getBoolean("verified"),
                    rs.getString("cover_object_key"),
                    rs.getInt("photo_count"),
                    rs.getTimestamp("published_at").toInstant(),
                    rs.getLong("view_count"),
                    rs.getBigDecimal("sort_price"));
        }

        private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
            double value = rs.getDouble(column);
            return rs.wasNull() ? null : value;
        }
    }
}
