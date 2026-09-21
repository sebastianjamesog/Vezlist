package cc.vezlist.admin.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * Generic append-only sink for admin actions that have nowhere else to
 * record themselves (user suspension, taxonomy CRUD, admin listing
 * takedowns). Moderation decisions keep writing to their own
 * {@code moderation_actions}/{@code audit_events} tables; the admin audit
 * feed flattens both sources together (see {@link cc.vezlist.admin.application.AdminAuditService}).
 */
@Repository
public class AdminAuditLogRepository {
    private final JdbcTemplate jdbc;

    public AdminAuditLogRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(UUID actorId, String action, String targetType, String targetId, String details) {
        jdbc.update(
                "INSERT INTO admin_audit_log(id, actor_id, action, target_type, target_id, details) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), actorId, action, targetType, targetId, details);
    }

    public record Entry(
            UUID id, UUID actorId, String actorName, String action, String targetType,
            String targetId, String details, Instant createdAt) {
    }

    public List<Entry> page(Instant beforeCreatedAt, UUID beforeId, int limit) {
        StringBuilder sql = new StringBuilder("""
                SELECT a.id, a.actor_id, u.display_name AS actor_name, a.action, a.target_type,
                       a.target_id, a.details, a.created_at
                FROM admin_audit_log a
                JOIN app_users u ON u.id = a.actor_id
                WHERE 1 = 1
                """);
        Object[] args;
        if (beforeCreatedAt != null) {
            sql.append(" AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?)) ");
            args = new Object[] {beforeCreatedAt, beforeCreatedAt, beforeId, limit};
        } else {
            args = new Object[] {limit};
        }
        sql.append(" ORDER BY a.created_at DESC, a.id DESC LIMIT ?");
        return jdbc.query(sql.toString(), new EntryMapper(), args);
    }

    private static final class EntryMapper implements RowMapper<Entry> {
        @Override
        public Entry mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new Entry(
                    rs.getObject("id", UUID.class),
                    rs.getObject("actor_id", UUID.class),
                    rs.getString("actor_name"),
                    rs.getString("action"),
                    rs.getString("target_type"),
                    rs.getString("target_id"),
                    rs.getString("details"),
                    rs.getTimestamp("created_at").toInstant());
        }
    }
}
