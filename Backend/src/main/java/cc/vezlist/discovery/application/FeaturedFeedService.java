package cc.vezlist.discovery.application;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import cc.vezlist.media.storage.ObjectStorage;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FeaturedFeedService {
    public enum Feed { AVAILABLE_NOW, NEW_TODAY, TRENDING }
    public record Card(UUID id, String title, String businessName, BigDecimal price,
                       String categoryLabel, String provinceLabel, String locationLabel,
                       boolean verified, String imageUrl, Instant publishedAt, long viewCount, long saveCount) {}
    public record Page(Feed feed, Instant windowStart, List<Card> items, long total) {}

    record Candidate(UUID id, Instant publishedAt, boolean availableNow,
                             long recentSaves, long recentSlots, Instant lastShown) {}
    private record Assignment(Candidate candidate, Feed feed, double score) {}

    private static final int SLOT_COUNT = 5;
    private static final int DIRECTORY_LIMIT = 60;
    private static final long WINDOW_SECONDS = 15 * 60;
    private static final String AVAILABLE_FROM = """
            FROM listings l
            JOIN app_users u ON u.id = l.owner_id AND u.enabled = TRUE
            JOIN user_preferences up ON up.user_id = l.owner_id AND up.available_now = TRUE
            JOIN categories c ON c.id = l.category_id
            JOIN locations p ON p.id = l.province_id
            JOIN locations a ON a.id = l.location_id
            WHERE l.site_scope = 'PERSONALS' AND l.status = 'ACTIVE'
              AND (l.expires_at IS NULL OR l.expires_at > now())
            """;
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;

    public FeaturedFeedService(JdbcTemplate jdbc, ObjectStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    @Transactional
    public Page get(Feed feed, boolean all) {
        Instant now = Instant.now();
        // Availability is current account state, not a 15-minute allocation.
        // Turning it on/off must affect the next read, even if the ad already
        // occupies another featured slot or was published during this window.
        if (feed == Feed.AVAILABLE_NOW) return available(now, all);
        Instant window = Instant.ofEpochSecond((now.getEpochSecond() / WINDOW_SECONDS) * WINDOW_SECONDS);
        // One worker builds a window, even when three feed requests arrive together.
        jdbc.execute("SELECT pg_advisory_xact_lock(20260928)");
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM featured_slots WHERE window_start = ?",
                Integer.class, Timestamp.from(window));
        if (count != null && count == 0) generate(window, now);
        List<Card> items = cards(feed, window, all);
        return new Page(feed, window, items, items.size());
    }

    private Page available(Instant now, boolean all) {
        long total = jdbc.queryForObject("SELECT COUNT(*) " + AVAILABLE_FROM, Long.class);
        List<Card> items = jdbc.query("""
                SELECT l.id, l.title, l.business_name, l.price, c.label AS category_label,
                       p.label AS province_label, a.label AS location_label, l.verified, l.view_count, l.save_count,
                       COALESCE(l.published_at, l.created_at) AS published_at,
                       (SELECT lm.object_key FROM listing_media lm WHERE lm.listing_id = l.id
                        AND lm.status = 'READY' ORDER BY lm.position, lm.created_at LIMIT 1) AS cover
                """ + AVAILABLE_FROM + """
                ORDER BY up.updated_at DESC, COALESCE(l.published_at, l.created_at) DESC, l.id LIMIT ?
                """, this::card, all ? DIRECTORY_LIMIT : SLOT_COUNT);
        return new Page(Feed.AVAILABLE_NOW, now, items, total);
    }

    private void generate(Instant window, Instant now) {
        List<Candidate> candidates = jdbc.query("""
                WITH recent_saves AS (
                    SELECT listing_id, COUNT(*) AS saves
                    FROM saved_listings WHERE saved_at >= ? GROUP BY listing_id
                ), recent_slots AS (
                    SELECT listing_id, COUNT(*) AS slots, MAX(window_start) AS last_shown
                    FROM featured_slots WHERE selected = TRUE AND window_start >= ? GROUP BY listing_id
                )
                SELECT l.id, COALESCE(l.published_at, l.created_at) AS published_at,
                       COALESCE(up.available_now, FALSE) AS available_now,
                       COALESCE(s.saves, 0) AS recent_saves,
                       COALESCE(x.slots, 0) AS recent_slots, x.last_shown
                FROM listings l JOIN app_users u ON u.id = l.owner_id AND u.enabled = TRUE
                LEFT JOIN user_preferences up ON up.user_id = l.owner_id
                LEFT JOIN recent_saves s ON s.listing_id = l.id
                LEFT JOIN recent_slots x ON x.listing_id = l.id
                WHERE l.site_scope = 'PERSONALS' AND l.status = 'ACTIVE'
                  AND (l.expires_at IS NULL OR l.expires_at > ?)
                ORDER BY COALESCE(s.saves, 0) DESC, COALESCE(up.available_now, FALSE) DESC,
                         COALESCE(l.published_at, l.created_at) DESC, l.id
                LIMIT 10000
                """, (rs, row) -> new Candidate(rs.getObject("id", UUID.class),
                        rs.getTimestamp("published_at").toInstant(), rs.getBoolean("available_now"),
                        rs.getLong("recent_saves"), rs.getLong("recent_slots"),
                        rs.getTimestamp("last_shown") == null ? null : rs.getTimestamp("last_shown").toInstant()),
                Timestamp.from(now.minus(Duration.ofHours(4))), Timestamp.from(now.minus(Duration.ofHours(24))),
                Timestamp.from(now));

        Map<Feed, List<Assignment>> byFeed = new EnumMap<>(Feed.class);
        for (Feed feed : Feed.values()) byFeed.put(feed, new ArrayList<>());
        for (Candidate candidate : candidates) {
            Feed assigned = assign(candidate, now, byFeed.get(Feed.NEW_TODAY).size(),
                    byFeed.get(Feed.TRENDING).size());
            if (assigned == null) continue;
            double base = assigned == Feed.NEW_TODAY ? freshness(candidate, now)
                    : assigned == Feed.TRENDING ? trend(candidate) : 1.0;
            byFeed.get(assigned).add(new Assignment(candidate, assigned, base + fairness(candidate, now)));
        }

        Set<UUID> selected = new HashSet<>();
        Comparator<Assignment> ranking = Comparator.comparingDouble(Assignment::score).reversed()
                // String order matches PostgreSQL UUID order; Java UUID comparison is signed.
                .thenComparing(assignment -> assignment.candidate().id().toString());
        for (List<Assignment> assignments : byFeed.values()) {
            assignments.sort(ranking);
            assignments.stream().limit(SLOT_COUNT).forEach(assignment -> selected.add(assignment.candidate().id()));
            for (Assignment assignment : assignments) {
                jdbc.update("INSERT INTO featured_slots(window_start, listing_id, feed, score, selected)"
                                + " VALUES (?, ?, ?, ?, ?)", Timestamp.from(window), assignment.candidate().id(),
                        assignment.feed().name(), assignment.score(), selected.contains(assignment.candidate().id()));
            }
        }
    }

    static Feed assign(Candidate candidate, Instant now, int newAssignments, int trendAssignments) {
        if (candidate.availableNow()) return Feed.AVAILABLE_NOW;
        boolean recent = Duration.between(candidate.publishedAt(), now).compareTo(Duration.ofHours(24)) <= 0;
        boolean trending = candidate.recentSaves() >= 2 && trend(candidate) >= 0.10;
        if (recent && trending) {
            double newAdjusted = freshness(candidate, now) / pressure(newAssignments);
            double trendAdjusted = trend(candidate) / pressure(trendAssignments);
            return trendAdjusted > newAdjusted ? Feed.TRENDING : Feed.NEW_TODAY;
        }
        if (recent) return Feed.NEW_TODAY;
        return trending ? Feed.TRENDING : null;
    }

    private static double pressure(int assignments) {
        return 1.0 + (double) assignments / SLOT_COUNT;
    }

    private static double freshness(Candidate candidate, Instant now) {
        double ageHours = Math.max(0, Duration.between(candidate.publishedAt(), now).toMinutes() / 60.0);
        return Math.max(0, 1.0 - ageHours / 24.0);
    }

    private static double trend(Candidate candidate) {
        // Recent saves are real events. Divide by prior featured exposure so
        // repeatedly slotted ads do not qualify from raw engagement alone.
        return Math.min(1.0, candidate.recentSaves() * 5.0 / (10.0 + candidate.recentSlots() * 5.0));
    }

    private static double fairness(Candidate candidate, Instant now) {
        double underserved = 0.25 / (1.0 + candidate.recentSlots());
        if (candidate.lastShown() == null) return underserved + 0.5;
        double hours = Math.max(0, Duration.between(candidate.lastShown(), now).toMinutes() / 60.0);
        return underserved + Math.min(0.5, hours / 24.0 * 0.5);
    }

    private List<Card> cards(Feed feed, Instant window, boolean all) {
        return jdbc.query("""
                SELECT l.id, l.title, l.business_name, l.price, c.label AS category_label,
                       p.label AS province_label, a.label AS location_label, l.verified, l.view_count, l.save_count,
                       COALESCE(l.published_at, l.created_at) AS published_at,
                       (SELECT lm.object_key FROM listing_media lm WHERE lm.listing_id = l.id
                        AND lm.status = 'READY' ORDER BY lm.position, lm.created_at LIMIT 1) AS cover
                FROM featured_slots f JOIN listings l ON l.id = f.listing_id
                JOIN app_users u ON u.id = l.owner_id AND u.enabled = TRUE
                JOIN categories c ON c.id = l.category_id
                JOIN locations p ON p.id = l.province_id
                JOIN locations a ON a.id = l.location_id
                WHERE f.window_start = ? AND f.feed = ? AND (? OR f.selected = TRUE)
                  AND l.status = 'ACTIVE' AND (l.expires_at IS NULL OR l.expires_at > now())
                ORDER BY f.score DESC, l.id LIMIT ?
                """, this::card, Timestamp.from(window), feed.name(), all, all ? DIRECTORY_LIMIT : SLOT_COUNT);
    }

    private Card card(ResultSet rs, int row) throws SQLException {
        String key = rs.getString("cover");
        return new Card(rs.getObject("id", UUID.class), rs.getString("title"),
                rs.getString("business_name"), rs.getBigDecimal("price"),
                rs.getString("category_label"), rs.getString("province_label"),
                rs.getString("location_label"), rs.getBoolean("verified"),
                key == null ? null : storage.authorizeDownload(key).toString(),
                rs.getTimestamp("published_at").toInstant(), rs.getLong("view_count"),
                rs.getLong("save_count"));
    }
}
