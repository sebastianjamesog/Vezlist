package cc.vezlist.admin.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import cc.vezlist.admin.persistence.AdminAuditLogRepository.Entry;
import cc.vezlist.shared.domain.SiteScope;

/**
 * Reads the moderation module's own history tables ({@code moderation_actions})
 * as admin-audit-feed entries, joined to the listing so the feed can be
 * filtered by site. This mirrors how other modules already read across
 * table boundaries with plain JDBC (e.g. {@code SellerRepository},
 * {@code ModerationRepository}) rather than reaching into moderation's Java
 * internals.
 */
@Repository
public class AdminModerationAuditRepository {
    private final JdbcTemplate jdbc;

    public AdminModerationAuditRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Entry> page(SiteScope site, Instant beforeCreatedAt, int fetchLimit) {
        StringBuilder sql = new StringBuilder("""
                SELECT m.id, m.actor_id, u.display_name AS actor_name, m.action,
                       'LISTING' AS target_type, m.listing_id::text AS target_id,
                       COALESCE(m.public_reason || ': ', '') || COALESCE(m.private_note, '') AS details,
                       m.created_at
                FROM moderation_actions m
                JOIN listings l ON l.id = m.listing_id
                JOIN app_users u ON u.id = m.actor_id
                WHERE l.site_scope = ?
                """);
        Object[] args;
        if (beforeCreatedAt != null) {
            sql.append(" AND m.created_at < ? ");
            args = new Object[] {site.name(), beforeCreatedAt, fetchLimit};
        } else {
            args = new Object[] {site.name(), fetchLimit};
        }
        sql.append(" ORDER BY m.created_at DESC, m.id DESC LIMIT ?");
        return jdbc.query(sql.toString(), new EntryMapper(), args);
    }

    private static final class EntryMapper implements RowMapper<Entry> {
        @Override
        public Entry mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new Entry(
                    rs.getObject("id", java.util.UUID.class),
                    rs.getObject("actor_id", java.util.UUID.class),
                    rs.getString("actor_name"),
                    rs.getString("action"),
                    rs.getString("target_type"),
                    rs.getString("target_id"),
                    rs.getString("details"),
                    rs.getTimestamp("created_at").toInstant(),
                    null,
                    null);
        }
    }
}
