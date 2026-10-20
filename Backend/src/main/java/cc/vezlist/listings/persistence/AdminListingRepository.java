package cc.vezlist.listings.persistence;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import cc.vezlist.shared.domain.SiteScope;

/** Admin-scoped browse across every listing regardless of owner, unlike the owner-scoped {@code ListingRepository}. */
@Repository
public class AdminListingRepository {
    private final JdbcTemplate jdbc;

    public AdminListingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Summary(
            UUID id, SiteScope site, String status, String title, String businessName, BigDecimal price,
            String categoryId, String categoryLabel, UUID ownerId, String ownerName, String ownerEmail,
            Instant createdAt, Instant updatedAt) {
    }

    public List<Summary> page(
            SiteScope site, String status, String query, Instant beforeCreatedAt, UUID beforeId, int fetchLimit) {
        StringBuilder sql = new StringBuilder("""
                SELECT l.id, l.site_scope, l.status, l.title, l.business_name, l.price,
                       l.category_id, c.label AS category_label, l.owner_id,
                       u.display_name AS owner_name, u.email AS owner_email, l.created_at, l.updated_at
                FROM listings l
                JOIN app_users u ON u.id = l.owner_id
                JOIN categories c ON c.id = l.category_id
                WHERE l.status <> 'DELETED'
                """);
        List<Object> args = new ArrayList<>();
        if (site != null) {
            sql.append(" AND l.site_scope = ? ");
            args.add(site.name());
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND l.status = ? ");
            args.add(status);
        }
        if (query != null && !query.isBlank()) {
            sql.append(" AND (l.title ILIKE ? OR l.business_name ILIKE ? OR u.email ILIKE ?) ");
            String like = "%" + query.trim() + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        if (beforeCreatedAt != null) {
            sql.append(" AND (l.created_at < ? OR (l.created_at = ? AND l.id < ?)) ");
            args.add(Timestamp.from(beforeCreatedAt));
            args.add(Timestamp.from(beforeCreatedAt));
            args.add(beforeId);
        }
        sql.append(" ORDER BY l.created_at DESC, l.id DESC LIMIT ?");
        args.add(fetchLimit);
        return jdbc.query(sql.toString(), new SummaryMapper(), args.toArray());
    }

    public void closeOpenCases(UUID listingId) {
        jdbc.update("UPDATE moderation_cases SET status = 'CLOSED', closed_at = now() WHERE listing_id = ? AND status = 'OPEN'", listingId);
    }

    public long countMatching(SiteScope site, String status, String query) {
        StringBuilder sql = new StringBuilder("""
                SELECT count(*) FROM listings l JOIN app_users u ON u.id = l.owner_id
                WHERE l.status <> 'DELETED'
                """);
        List<Object> args = new ArrayList<>();
        if (site != null) {
            sql.append(" AND l.site_scope = ? ");
            args.add(site.name());
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND l.status = ? ");
            args.add(status);
        }
        if (query != null && !query.isBlank()) {
            sql.append(" AND (l.title ILIKE ? OR l.business_name ILIKE ? OR u.email ILIKE ?) ");
            String like = "%" + query.trim() + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        Long value = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return value == null ? 0 : value;
    }

    public record OwnerInfo(UUID ownerId, String ownerName, String ownerEmail) {
    }

    public OwnerInfo owner(UUID listingId) {
        List<OwnerInfo> rows = jdbc.query("""
                SELECT u.id, u.display_name, u.email FROM listings l JOIN app_users u ON u.id = l.owner_id
                WHERE l.id = ?
                """, (rs, n) -> new OwnerInfo(
                rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("email")), listingId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private static final class SummaryMapper implements RowMapper<Summary> {
        @Override
        public Summary mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new Summary(
                    rs.getObject("id", UUID.class), SiteScope.valueOf(rs.getString("site_scope")),
                    rs.getString("status"), rs.getString("title"), rs.getString("business_name"),
                    rs.getBigDecimal("price"), rs.getString("category_id"), rs.getString("category_label"),
                    rs.getObject("owner_id", UUID.class), rs.getString("owner_name"), rs.getString("owner_email"),
                    rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant());
        }
    }
}
