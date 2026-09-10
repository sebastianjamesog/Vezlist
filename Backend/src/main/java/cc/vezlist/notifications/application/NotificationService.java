package cc.vezlist.notifications.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

@Service
public class NotificationService {
    private final JdbcTemplate jdbc;
    public NotificationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Item(UUID id, String type, String title, String message, String href, Instant createdAt, Instant readAt) { }
    public record Page(List<Item> items, String nextCursor) { }
    public record Count(long count) { }
    private record Row(long sequence, Item item) { }

    @Transactional(readOnly = true)
    public Page list(UUID actor, SiteScope site, int limit, String cursor) {
        requireEnabled(actor);
        if (limit < 1 || limit > 50) throw new NotificationException(BAD_REQUEST, "Limit must be between 1 and 50.");
        long before = Long.MAX_VALUE;
        if (cursor != null) {
            try {
                if (!cursor.matches("[1-9][0-9]{0,18}")) throw new NumberFormatException();
                before = Long.parseLong(cursor);
            } catch (NumberFormatException invalid) {
                throw new NotificationException(BAD_REQUEST, "Notification cursor is invalid.");
            }
        }
        var rows = jdbc.query("""
                SELECT * FROM notifications WHERE recipient_id = ? AND site_scope = ? AND sequence < ?
                ORDER BY sequence DESC LIMIT ?
                """, (rs, n) -> new Row(rs.getLong("sequence"), new Item(rs.getObject("id", UUID.class),
                    rs.getString("event_type"), rs.getString("title"), rs.getString("message"), rs.getString("href"),
                    rs.getTimestamp("created_at").toInstant(),
                    rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").toInstant())),
                actor, site.name(), before, limit + 1);
        boolean more = rows.size() > limit;
        var page = more ? rows.subList(0, limit) : rows;
        return new Page(page.stream().map(Row::item).toList(), more ? Long.toString(page.getLast().sequence()) : null);
    }

    @Transactional(readOnly = true)
    public Count unread(UUID actor, SiteScope site) {
        requireEnabled(actor);
        return count(actor, site);
    }

    @Transactional
    public Count markRead(UUID actor, SiteScope site, UUID id) {
        requireEnabled(actor);
        int updated = jdbc.update("""
                UPDATE notifications SET read_at = COALESCE(read_at, now())
                WHERE id = ? AND recipient_id = ? AND site_scope = ?
                """, id, actor, site.name());
        if (updated == 0) throw new NotificationException(NOT_FOUND, "Notification not found.");
        return count(actor, site);
    }

    @Transactional
    public Count markAllRead(UUID actor, SiteScope site) {
        requireEnabled(actor);
        jdbc.update("UPDATE notifications SET read_at = now() WHERE recipient_id = ? AND site_scope = ? AND read_at IS NULL",
                actor, site.name());
        return count(actor, site);
    }

    private Count count(UUID actor, SiteScope site) {
        return new Count(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ? AND site_scope = ? AND read_at IS NULL",
                Long.class, actor, site.name()));
    }
    private void requireEnabled(UUID actor) {
        if (jdbc.queryForObject("SELECT count(*) FROM app_users WHERE id = ? AND enabled = true", Long.class, actor) == 0)
            throw new NotificationException(FORBIDDEN, "This account is not available.");
    }
}
