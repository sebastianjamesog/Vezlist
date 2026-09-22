package cc.vezlist.verification.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import cc.vezlist.shared.domain.SiteScope;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Staff-facing joined reads (listing title/owner alongside a verification
 * request) — the JPA {@link VerificationRequestRepository} covers the
 * owner-facing lifecycle, this covers the admin queue/detail views, mirroring
 * how {@code cc.vezlist.moderation.persistence.ModerationRepository} mixes
 * both styles for the same reason.
 */
@Repository
public class VerificationQueryRepository {
    private final JdbcTemplate jdbc;

    public VerificationQueryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record QueueRow(
            UUID id, UUID listingId, String listingTitle, SiteScope site,
            UUID ownerId, String ownerEmail, String code, Instant submittedAt) {
    }

    public List<QueueRow> queue(SiteScope site, int limit, int offset) {
        return jdbc.query("""
                SELECT r.id, r.listing_id, l.title AS listing_title, l.site_scope,
                       r.owner_id, u.email AS owner_email, r.code, r.submitted_at
                FROM listing_verification_requests r
                JOIN listings l ON l.id = r.listing_id
                JOIN app_users u ON u.id = r.owner_id
                WHERE r.status = 'PENDING_REVIEW' AND l.site_scope = ?
                  AND u.enabled = true AND l.status IN ('PENDING_REVIEW', 'ACTIVE')
                  AND (l.status <> 'ACTIVE' OR l.expires_at IS NULL OR l.expires_at > now())
                  AND (l.submitted_at IS NULL OR r.created_at >= l.submitted_at)
                ORDER BY r.submitted_at ASC, r.id ASC
                LIMIT ? OFFSET ?
                """, (rs, n) -> new QueueRow(
                rs.getObject("id", UUID.class), rs.getObject("listing_id", UUID.class),
                rs.getString("listing_title"), SiteScope.valueOf(rs.getString("site_scope")),
                rs.getObject("owner_id", UUID.class), rs.getString("owner_email"), rs.getString("code"),
                rs.getTimestamp("submitted_at") == null ? null : rs.getTimestamp("submitted_at").toInstant()),
                site.name(), limit, offset);
    }

    public record DetailRow(
            UUID id, UUID listingId, String listingTitle, SiteScope site,
            UUID ownerId, String ownerEmail) {
    }

    public Optional<DetailRow> detail(UUID requestId) {
        return jdbc.query("""
                SELECT r.id, r.listing_id, l.title AS listing_title, l.site_scope, r.owner_id, u.email AS owner_email
                FROM listing_verification_requests r
                JOIN listings l ON l.id = r.listing_id
                JOIN app_users u ON u.id = r.owner_id
                WHERE r.id = ?
                """, (rs, n) -> new DetailRow(
                rs.getObject("id", UUID.class), rs.getObject("listing_id", UUID.class),
                rs.getString("listing_title"), SiteScope.valueOf(rs.getString("site_scope")),
                rs.getObject("owner_id", UUID.class), rs.getString("owner_email")),
                requestId).stream().findFirst();
    }
}
