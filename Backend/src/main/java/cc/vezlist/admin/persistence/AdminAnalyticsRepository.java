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
