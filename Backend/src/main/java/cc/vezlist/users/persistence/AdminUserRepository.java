package cc.vezlist.users.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Read model for the admin users console. Deliberately plain JDBC, like {@code SellerRepository}. */
@Repository
public class AdminUserRepository {
    private final JdbcTemplate jdbc;

    public AdminUserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Summary(
            UUID id, String displayName, String email, Set<String> roles, boolean enabled,
            boolean emailVerified, Instant createdAt, long listingCount) {
    }

    public record Detail(
            UUID id, String displayName, String email, Set<String> roles, boolean enabled,
            boolean emailVerified, Instant createdAt, Instant suspendedAt, String suspensionReason,
            long listingCount, long activeListingCount) {
    }

    public List<Summary> page(String query, Instant beforeCreatedAt, UUID beforeId, int fetchLimit, boolean staffOnly) {
        StringBuilder sql = new StringBuilder("""
                SELECT u.id, u.display_name, u.email, u.enabled, u.email_verified, u.created_at,
                       (SELECT count(*) FROM listings l WHERE l.owner_id = u.id AND l.status <> 'DELETED') AS listing_count
                FROM app_users u
                WHERE 1 = 1
                """);
        List<Object> args = new java.util.ArrayList<>();
        if (staffOnly) sql.append(" AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('ADMIN', 'MODERATOR')) ");
        if (query != null && !query.isBlank()) {
            sql.append(" AND (u.email ILIKE ? OR u.display_name ILIKE ?) ");
            String like = "%" + query.trim() + "%";
            args.add(like);
            args.add(like);
        }
        if (beforeCreatedAt != null) {
            sql.append(" AND (u.created_at < ? OR (u.created_at = ? AND u.id < ?)) ");
            args.add(java.sql.Timestamp.from(beforeCreatedAt));
            args.add(java.sql.Timestamp.from(beforeCreatedAt));
            args.add(beforeId);
        }
        sql.append(" ORDER BY u.created_at DESC, u.id DESC LIMIT ?");
        args.add(fetchLimit);
        List<Summary> rows = jdbc.query(sql.toString(), new SummaryMapper(), args.toArray());
        return attachRoles(rows);
    }

    private List<Summary> attachRoles(List<Summary> rows) {
        return rows.stream()
                .map(row -> new Summary(row.id(), row.displayName(), row.email(), roles(row.id()),
                        row.enabled(), row.emailVerified(), row.createdAt(), row.listingCount()))
                .toList();
    }

    public Detail detail(UUID id) {
        List<Detail> rows = jdbc.query("""
                SELECT u.id, u.display_name, u.email, u.enabled, u.email_verified, u.created_at,
                       u.suspended_at, u.suspension_reason,
                       (SELECT count(*) FROM listings l WHERE l.owner_id = u.id AND l.status <> 'DELETED') AS listing_count,
                       (SELECT count(*) FROM listings l WHERE l.owner_id = u.id AND l.status = 'ACTIVE') AS active_listing_count
                FROM app_users u WHERE u.id = ?
                """, (rs, n) -> new Detail(
                rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("email"),
                roles(id), rs.getBoolean("enabled"), rs.getBoolean("email_verified"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("suspended_at") == null ? null : rs.getTimestamp("suspended_at").toInstant(),
                rs.getString("suspension_reason"),
                rs.getLong("listing_count"), rs.getLong("active_listing_count")), id);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public long countMatching(String query, boolean staffOnly) {
        String sql = "SELECT count(*) FROM app_users u WHERE 1 = 1";
        if (staffOnly) sql += " AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('ADMIN', 'MODERATOR'))";
        if (query == null || query.isBlank()) return jdbc.queryForObject(sql, Long.class);
        String like = "%" + query.trim() + "%";
        return jdbc.queryForObject(sql + " AND (u.email ILIKE ? OR u.display_name ILIKE ?)", Long.class, like, like);
    }

    private Set<String> roles(UUID userId) {
        return Set.copyOf(jdbc.queryForList("SELECT role FROM user_roles WHERE user_id = ?", String.class, userId));
    }

    private static final class SummaryMapper implements RowMapper<Summary> {
        @Override
        public Summary mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new Summary(
                    rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("email"),
                    Set.of(), rs.getBoolean("enabled"), rs.getBoolean("email_verified"),
                    rs.getTimestamp("created_at").toInstant(), rs.getLong("listing_count"));
        }
    }
}
