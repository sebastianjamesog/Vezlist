package cc.vezlist.stories.application;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.shared.paging.OpaqueCursor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminStoryService {
    public record Item(UUID id, UUID ownerId, String creatorName, String avatarUrl, String mediaUrl,
                       String mediaType, Instant publishedAt, Instant expiresAt) {}
    public record Page(List<Item> items, String nextCursor, boolean hasMore) {}
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;
    private final AdminAuditService audit;
    public AdminStoryService(JdbcTemplate jdbc, ObjectStorage storage, AdminAuditService audit) {
        this.jdbc = jdbc; this.storage = storage; this.audit = audit;
    }
    @Transactional(readOnly = true)
    public Page list(UUID actor, String cursor, int limit) {
        requireStaff(actor);
        var anchor = OpaqueCursor.decode(cursor);
        var args = new ArrayList<Object>();
        String sql = "SELECT s.*,u.display_name,p.avatar_url FROM stories s JOIN app_users u ON u.id=s.owner_id "
                + "LEFT JOIN user_profiles p ON p.user_id=u.id WHERE s.status='PUBLISHED' AND s.expires_at>now() ";
        if (anchor != null) {
            sql += "AND (s.published_at,s.id)<(?,?) ";
            args.add(Timestamp.from(anchor.createdAt())); args.add(anchor.id());
        }
        sql += "ORDER BY s.published_at DESC,s.id DESC LIMIT ?";
        args.add(limit + 1);
        List<Item> rows = jdbc.query(sql, (rs, n) -> {
            Instant expires = rs.getTimestamp("expires_at").toInstant();
            Duration remaining = Duration.between(Instant.now(), expires);
            String media = remaining.getSeconds() < 1 ? null : storage.authorizeDownload(rs.getString("object_key"),
                    Duration.ofSeconds(Math.min(300, remaining.getSeconds()))).toString();
            return new Item(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class),
                    rs.getString("display_name"), rs.getString("avatar_url"), media, rs.getString("media_type"),
                    rs.getTimestamp("published_at").toInstant(), expires);
        }, args.toArray());
        boolean more = rows.size() > limit;
        List<Item> items = more ? rows.subList(0, limit) : rows;
        String next = more ? OpaqueCursor.encode(new OpaqueCursor.Anchor(items.getLast().publishedAt(), items.getLast().id())) : null;
        return new Page(items, next, more);
    }
    @Transactional
    public void remove(UUID actor, UUID id) {
        requireStaff(actor);
        int changed = jdbc.update("UPDATE stories SET status='DELETED' WHERE id=? AND status='PUBLISHED'", id);
        if (changed == 0) throw new StoryException(HttpStatus.NOT_FOUND, "STORY_NOT_FOUND", "This published update is no longer available.");
        audit.record(actor, "STORY_REMOVED", "STORY", id.toString(), "Removed by a moderator");
    }
    @Transactional
    public void removeCreator(UUID actor, UUID owner) {
        requireStaff(actor);
        int changed = jdbc.update("UPDATE stories SET status='DELETED' WHERE owner_id=? AND status='PUBLISHED' AND expires_at>now()", owner);
        audit.record(actor, "CREATOR_STORIES_REMOVED", "USER", owner.toString(), "Removed " + changed + " published updates");
    }
    private void requireStaff(UUID actor) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM app_users u JOIN user_roles r ON r.user_id=u.id "
                + "WHERE u.id=? AND u.enabled=true AND r.role IN ('ADMIN','MODERATOR')", Integer.class, actor);
        if (count == null || count == 0) throw new StoryException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Only enabled staff can moderate updates.");
    }
}
