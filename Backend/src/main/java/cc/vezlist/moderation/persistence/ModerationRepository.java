package cc.vezlist.moderation.persistence;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.moderation.application.ModerationException;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Repository
public class ModerationRepository {
    private final JdbcTemplate jdbc;
    public ModerationRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Listing(UUID id, UUID owner, SiteScope site, String category, String status,
                          long version, Instant expiresAt, boolean enabled, String reason,
                          boolean verificationRequested, boolean verified, UUID moderationEpisode, String provinceId, String locationId) { }
    public record Case(UUID id, UUID listingId, String kind, String status, UUID assignee, long reviewVersion) { }

    public Listing listing(UUID id, boolean lock) {
        var rows = jdbc.query("""
                SELECT l.*, u.enabled FROM listings l JOIN app_users u ON u.id = l.owner_id
                WHERE l.id = ?
                """ + (lock ? " FOR UPDATE OF l" : ""), (rs, n) -> new Listing(
                id, rs.getObject("owner_id", UUID.class), SiteScope.valueOf(rs.getString("site_scope")),
                rs.getString("category_id"), rs.getString("status"), rs.getLong("version"),
                rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant(),
                rs.getBoolean("enabled"), rs.getString("moderation_reason"),
                rs.getBoolean("verification_requested"), rs.getBoolean("verified"), rs.getObject("moderation_episode", UUID.class),
                rs.getString("province_id"), rs.getString("location_id")), id);
        if (rows.isEmpty()) throw new ModerationException(NOT_FOUND, "Listing not found.");
        return rows.getFirst();
    }
    public Case caseById(UUID id) {
        var rows = jdbc.query("SELECT * FROM moderation_cases WHERE id = ?", (rs, n) -> new Case(
                id, rs.getObject("listing_id", UUID.class), rs.getString("kind"), rs.getString("status"),
                rs.getObject("assigned_to", UUID.class), rs.getLong("review_version")), id);
        if (rows.isEmpty()) throw new ModerationException(NOT_FOUND, "Review case not found.");
        return rows.getFirst();
    }
    public UUID openCase(Listing listing, String kind) {
        var existing = jdbc.queryForList("SELECT id,kind FROM moderation_cases WHERE listing_id=? AND status='OPEN'", listing.id());
        if (!existing.isEmpty()) {
            if (!kind.equals(existing.getFirst().get("kind")))
                throw new ModerationException(org.springframework.http.HttpStatus.CONFLICT, "A different review is already open for this listing.");
            return (UUID) existing.getFirst().get("id");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO moderation_cases(id, listing_id, kind, review_version) VALUES (?, ?, ?, ?)",
                id, listing.id(), kind, listing.version());
        return id;
    }
    public List<Map<String, Object>> queue(SiteScope site, int limit, int offset) {
        return jdbc.queryForList("""
                SELECT c.id, c.listing_id, c.kind, c.assigned_to, c.created_at, l.site_scope,
                       l.title, l.category_id, l.status AS listing_status
                FROM moderation_cases c JOIN listings l ON l.id = c.listing_id
                WHERE c.status = 'OPEN' AND l.site_scope = ?
                ORDER BY c.created_at, c.id LIMIT ? OFFSET ?
                """, site.name(), limit, offset);
    }
    public List<Map<String, Object>> query(String sql, Object... args) { return jdbc.queryForList(sql, args); }
    public long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }
    public int update(String sql, Object... args) { return jdbc.update(sql, args); }

    public UUID action(Case review, UUID actor, String action, String reason, String note, boolean eligibility) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO moderation_actions(id, case_id, listing_id, actor_id, action,
                                               public_reason, private_note, eligibility_checked)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, review.id(), review.listingId(), actor, action, reason, note, eligibility);
        audit(actor, review.listingId(), action, id);
        return id;
    }
    public void audit(UUID actor, UUID subject, String event, UUID action) {
        jdbc.update("INSERT INTO audit_events(id, actor_id, subject_id, event_type, action_id) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID(), actor, subject, event, action);
    }
}
