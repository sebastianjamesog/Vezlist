package cc.vezlist.admin.persistence;

import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import cc.vezlist.shared.domain.SiteScope;

/** Simple aggregate count queries against existing tables for the admin analytics summary. */
@Repository
public class AdminAnalyticsRepository {
    private final JdbcTemplate jdbc;

    public AdminAnalyticsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long totalUsers() {
        return count("SELECT count(*) FROM app_users");
    }

    public long usersWithListings(SiteScope site) {
        return count("SELECT count(DISTINCT owner_id) FROM listings WHERE site_scope=? AND submitted_at IS NOT NULL", site.name());
    }

    public Map<String, Long> queueCounts(SiteScope site) {
        String scope = site == null ? "" : " AND l.site_scope=?";
        Object[] args = site == null ? new Object[0] : new Object[] {site.name()};
        return Map.of(
            "pending", count("SELECT count(*) FROM listings l WHERE l.status='PENDING_REVIEW'" + scope, args),
            "openReports", count("SELECT count(*) FROM moderation_cases c JOIN listings l ON l.id=c.listing_id WHERE c.status='OPEN' AND c.kind='REPORT'" + scope, args),
            "openAppeals", count("SELECT count(*) FROM moderation_cases c JOIN listings l ON l.id=c.listing_id WHERE c.status='OPEN' AND c.kind='APPEAL'" + scope, args),
            // Count actionable requests using the same eligibility rules as the verification queue.
            "openVerifications", count("""
                SELECT count(*) FROM listing_verification_requests v
                JOIN listings l ON l.id=v.listing_id
                JOIN app_users u ON u.id=v.owner_id
                WHERE v.status='PENDING_REVIEW' AND u.enabled=true
                  AND l.status IN ('PENDING_REVIEW', 'ACTIVE')
                  AND (l.status <> 'ACTIVE' OR l.expires_at IS NULL OR l.expires_at > now())
                  AND (l.submitted_at IS NULL OR v.created_at >= l.submitted_at)
                """ + scope, args),
            "openTickets", count("SELECT count(*) FROM support_tickets l WHERE l.status='OPEN'" + scope, args));
    }

    public long suspendedUsers() {
        return count("SELECT count(*) FROM app_users WHERE enabled = FALSE");
    }

    public Map<String, Long> listingsByStatus(SiteScope site) {
        return jdbc.query(
                "SELECT status, count(*) AS n FROM listings WHERE site_scope = ? GROUP BY status",
                rs -> {
                    var map = new java.util.LinkedHashMap<String, Long>();
                    while (rs.next()) {
                        map.put(rs.getString("status"), rs.getLong("n"));
                    }
                    return map;
                },
                site.name());
    }

    public long newListingsSince(SiteScope site, int days) {
        return count(
                "SELECT count(*) FROM listings WHERE site_scope = ? AND created_at > now() - (? || ' days')::interval",
                site.name(), days);
    }

    public long activeReportsCount(SiteScope site) {
        return count("""
                SELECT count(*) FROM moderation_cases c JOIN listings l ON l.id = c.listing_id
                WHERE c.status = 'OPEN' AND c.kind = 'REPORT' AND l.site_scope = ?
                """, site.name());
    }

    public long openModerationCasesCount(SiteScope site) {
        return count("""
                SELECT count(*) FROM moderation_cases c JOIN listings l ON l.id = c.listing_id
                WHERE c.status = 'OPEN' AND l.site_scope = ?
                """, site.name());
    }

    public long totalListings(SiteScope site) {
        return count("SELECT count(*) FROM listings WHERE site_scope = ?", site.name());
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }
}
