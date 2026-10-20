package cc.vezlist.admin.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import cc.vezlist.admin.persistence.AdminAuditLogRepository.Entry;

/**
 * Append-only sink for auth/security events (login, logout, register,
 * password change) -- separate from {@code admin_audit_log} because these
 * have no admin actor and, for a failed login, may have no resolvable
 * account at all. Read side maps into the same {@link Entry} shape the
 * admin audit feed already flattens {@code admin_audit_log} and
 * {@code moderation_actions} into, so all three merge as one timeline.
 */
@Repository
public class SecurityEventRepository {
    private final JdbcTemplate jdbc;

    public SecurityEventRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(
            String eventType, UUID userId, String attemptedEmail, String ipAddress, String userAgent, String details) {
        jdbc.update(
                "INSERT INTO security_events(id, event_type, user_id, attempted_email, ip_address, user_agent, details) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), eventType, userId, attemptedEmail, ipAddress, userAgent, details);
    }

    public List<Entry> page(Instant beforeCreatedAt, UUID beforeId, int limit) {
        StringBuilder sql = new StringBuilder("""
                SELECT e.id, e.user_id, COALESCE(u.display_name, e.attempted_email, 'Unknown') AS actor_name,
                       e.event_type, e.details, e.created_at, e.ip_address, e.user_agent
                FROM security_events e
                LEFT JOIN app_users u ON u.id = e.user_id
                WHERE 1 = 1
                """);
        Object[] args;
        if (beforeCreatedAt != null) {
            sql.append(" AND (e.created_at < ? OR (e.created_at = ? AND e.id < ?)) ");
            args = new Object[] {java.sql.Timestamp.from(beforeCreatedAt), java.sql.Timestamp.from(beforeCreatedAt), beforeId, limit};
        } else {
            args = new Object[] {limit};
        }
        sql.append(" ORDER BY e.created_at DESC, e.id DESC LIMIT ?");
        return jdbc.query(sql.toString(), new EntryMapper(), args);
    }

    private static final class EntryMapper implements RowMapper<Entry> {
        @Override
        public Entry mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new Entry(
                    rs.getObject("id", UUID.class),
                    rs.getObject("user_id", UUID.class),
                    rs.getString("actor_name"),
                    rs.getString("event_type"),
                    "SECURITY",
                    null,
                    rs.getString("details"),
                    rs.getTimestamp("created_at").toInstant(),
                    rs.getString("ip_address"),
                    rs.getString("user_agent"));
        }
    }
}
