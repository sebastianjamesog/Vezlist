package cc.vezlist.live.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import cc.vezlist.media.storage.ObjectStorage;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LivePresenceService {
    public record LiveCreator(UUID ownerId, UUID listingId, String creatorName, String title,
                              String location, Instant startedAt, String imageUrl, String avatarUrl) {}
    public record Directory(List<LiveCreator> items, long total) {}

    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;

    public LivePresenceService(JdbcTemplate jdbc, ObjectStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    @Transactional
    public LiveCreator start(UUID ownerId, UUID listingId, String title) {
        Integer eligible = jdbc.queryForObject("SELECT COUNT(*) FROM listings l JOIN app_users u ON u.id = l.owner_id"
                + " WHERE l.id = ? AND l.owner_id = ? AND u.enabled = TRUE AND l.site_scope = 'PERSONALS'"
                + " AND l.status = 'ACTIVE' AND (l.expires_at IS NULL OR l.expires_at > now())",
                Integer.class, listingId, ownerId);
        if (eligible == null || eligible == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        jdbc.update("INSERT INTO live_presence(owner_id, listing_id, title) VALUES (?, ?, ?)"
                + " ON CONFLICT (owner_id) DO UPDATE SET listing_id = EXCLUDED.listing_id,"
                + " title = EXCLUDED.title, started_at = now(), heartbeat_at = now()",
                ownerId, listingId, title.strip());
        return mine(ownerId);
    }

    @Transactional
    public LiveCreator heartbeat(UUID ownerId) {
        int count = jdbc.update("UPDATE live_presence p SET heartbeat_at = now()"
                + " FROM listings l JOIN app_users u ON u.id = l.owner_id"
                + " WHERE p.owner_id = ? AND p.listing_id = l.id AND p.owner_id = l.owner_id"
                + " AND p.heartbeat_at > now() - interval '45 seconds'"
                + " AND u.enabled = TRUE AND l.site_scope = 'PERSONALS' AND l.status = 'ACTIVE'"
                + " AND (l.expires_at IS NULL OR l.expires_at > now())", ownerId);
        if (count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return mine(ownerId);
    }

    @Transactional
    public void stop(UUID ownerId) {
        jdbc.update("DELETE FROM live_presence WHERE owner_id = ?", ownerId);
    }

    @Transactional(readOnly = true)
    public Directory list(int limit) {
        if (limit < 1 || limit > 50) throw new IllegalArgumentException("Limit must be 1-50.");
        String from = " FROM live_presence p JOIN listings l ON l.id = p.listing_id"
                + " JOIN app_users u ON u.id = p.owner_id JOIN locations a ON a.id = l.location_id"
                + " LEFT JOIN user_profiles up ON up.user_id = u.id"
                + " WHERE p.owner_id = l.owner_id AND p.heartbeat_at > now() - interval '45 seconds'"
                + " AND u.enabled = TRUE AND l.site_scope = 'PERSONALS' AND l.status = 'ACTIVE'"
                + " AND (l.expires_at IS NULL OR l.expires_at > now())";
        long total = jdbc.queryForObject("SELECT COUNT(*)" + from, Long.class);
        List<LiveCreator> items = jdbc.query("SELECT p.owner_id, p.listing_id, u.display_name,"
                + " p.title, a.label AS location, p.started_at, up.avatar_url,"
                + " (SELECT lm.object_key FROM listing_media lm WHERE lm.listing_id = l.id"
                + " AND lm.status = 'READY' ORDER BY lm.position, lm.created_at LIMIT 1) AS cover" + from
                + " ORDER BY p.started_at DESC, p.owner_id LIMIT ?", (rs, n) -> new LiveCreator(
                        rs.getObject("owner_id", UUID.class), rs.getObject("listing_id", UUID.class),
                        rs.getString("display_name"), rs.getString("title"), rs.getString("location"),
                        rs.getTimestamp("started_at").toInstant(), coverUrl(rs.getString("cover")),
                        rs.getString("avatar_url")), limit);
        return new Directory(items, total);
    }

    private LiveCreator mine(UUID ownerId) {
        return jdbc.queryForObject("SELECT p.owner_id, p.listing_id, u.display_name, p.title,"
                + " a.label AS location, p.started_at, up.avatar_url,"
                + " (SELECT lm.object_key FROM listing_media lm WHERE lm.listing_id = l.id"
                + " AND lm.status = 'READY' ORDER BY lm.position, lm.created_at LIMIT 1) AS cover"
                + " FROM live_presence p"
                + " JOIN listings l ON l.id = p.listing_id JOIN locations a ON a.id = l.location_id"
                + " JOIN app_users u ON u.id = p.owner_id"
                + " LEFT JOIN user_profiles up ON up.user_id = u.id WHERE p.owner_id = ?", (rs, n) -> new LiveCreator(
                        rs.getObject("owner_id", UUID.class), rs.getObject("listing_id", UUID.class),
                        rs.getString("display_name"), rs.getString("title"), rs.getString("location"),
                        rs.getTimestamp("started_at").toInstant(), coverUrl(rs.getString("cover")),
                        rs.getString("avatar_url")), ownerId);
    }

    private String coverUrl(String key) {
        return key == null ? null : storage.authorizeDownload(key).toString();
    }
}
