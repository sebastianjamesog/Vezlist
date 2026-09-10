package cc.vezlist.notifications.application;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import cc.vezlist.notifications.domain.NotificationType;
import cc.vezlist.notifications.application.NotificationChannelProvider.Channel;
import cc.vezlist.notifications.application.NotificationChannelProvider.Delivery;
import cc.vezlist.shared.domain.SiteScope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class NotificationProcessor {
    private static final Logger log = LoggerFactory.getLogger(NotificationProcessor.class);
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final List<NotificationChannelProvider> providers;
    private record Claim(UUID id, int attempts) { }
    private record Event(Claim claim, UUID recipient, SiteScope site, NotificationType type, UUID subject, String key) { }

    public NotificationProcessor(JdbcTemplate jdbc, PlatformTransactionManager manager, List<NotificationChannelProvider> providers) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.providers = List.copyOf(providers);
        if (providers.stream().map(NotificationChannelProvider::channel).distinct().count() != providers.size())
            throw new IllegalArgumentException("Only one provider per notification channel is allowed.");
    }

    public boolean processNextEvent() {
        AtomicReference<Claim> claimed = new AtomicReference<>();
        try {
            return Boolean.TRUE.equals(transaction.execute(tx -> {
                var events = jdbc.query("""
                        SELECT * FROM notification_events WHERE status = 'PENDING' AND available_at <= now()
                        ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
                        """, (rs, n) -> new Event(new Claim(rs.getObject("id", UUID.class), rs.getInt("attempts")),
                            rs.getObject("recipient_id", UUID.class), SiteScope.valueOf(rs.getString("site_scope")),
                            NotificationType.valueOf(rs.getString("event_type")), rs.getObject("subject_id", UUID.class), rs.getString("dedup_key")));
                if (events.isEmpty()) return false;
                Event event = events.getFirst();
                claimed.set(event.claim());
                if (!enabled(event.recipient())) {
                    completeEvent(event.claim(), "ACCOUNT_DISABLED");
                    return true;
                }
                if (!relevant(event)) {
                    completeEvent(event.claim(), "SUBJECT_UNAVAILABLE");
                    return true;
                }
                UUID notification = UUID.randomUUID();
                jdbc.update("""
                        INSERT INTO notifications(id, event_id, recipient_id, site_scope, event_type, title, message, href)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING
                        """, notification, event.claim().id(), event.recipient(), event.site().name(), event.type().name(),
                        event.type().title(), event.type().message(), event.type().href());
                notification = jdbc.queryForObject("SELECT id FROM notifications WHERE event_id = ?", UUID.class, event.claim().id());
                jdbc.update("""
                        INSERT INTO notification_deliveries(notification_id, channel, status, completed_at)
                        VALUES (?, 'IN_APP', 'DELIVERED', now()), (?, 'EMAIL', 'PENDING', NULL), (?, 'PUSH', 'PENDING', NULL)
                        ON CONFLICT(notification_id, channel) DO NOTHING
                        """, notification, notification, notification);
                completeEvent(event.claim(), null);
                return true;
            }));
        } catch (RuntimeException failure) {
            if (claimed.get() == null) throw failure;
            retry("notification_events", claimed.get());
            return true;
        }
    }

    public boolean processNextDelivery() {
        AtomicReference<Claim> claimed = new AtomicReference<>();
        try {
            return Boolean.TRUE.equals(transaction.execute(tx -> {
                var deliveries = jdbc.queryForList("""
                        SELECT d.id, d.attempts, d.channel, n.recipient_id, n.site_scope
                        FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
                        WHERE d.status = 'PENDING' AND d.available_at <= now()
                        ORDER BY d.available_at, d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
                        """);
                if (deliveries.isEmpty()) return false;
                var row = deliveries.getFirst();
                Claim claim = new Claim((UUID) row.get("id"), (Integer) row.get("attempts"));
                claimed.set(claim);
                UUID recipient = (UUID) row.get("recipient_id");
                Channel channel = Channel.valueOf((String) row.get("channel"));
                String skip = skipReason(recipient, channel);
                var provider = providers.stream().filter(p -> p.channel() == channel).findFirst();
                if (skip == null && provider.isEmpty()) skip = "PROVIDER_NOT_CONFIGURED";
                if (skip != null) {
                    completeDelivery(claim, "SKIPPED", skip);
                } else {
                    // External previews deliberately contain no ad, Personals, moderation, or payment details.
                    provider.orElseThrow().deliver(new Delivery(claim.id(), recipient,
                            SiteScope.valueOf((String) row.get("site_scope")), "Vezlist account update",
                            "You have an account update. Sign in to view your notifications.", "/profile/notifications"));
                    completeDelivery(claim, "DELIVERED", null);
                }
                return true;
            }));
        } catch (RuntimeException failure) {
            if (claimed.get() == null) throw failure;
            retry("notification_deliveries", claimed.get());
            return true;
        }
    }

    public int queueExpiringListings() {
        return jdbc.update("""
                INSERT INTO notification_events(dedup_key, recipient_id, site_scope, event_type, subject_id)
                SELECT 'expiry:' || l.id || ':' || extract(epoch from l.expires_at)::text,
                       l.owner_id, l.site_scope, 'LISTING_EXPIRING', l.id
                FROM listings l JOIN app_users u ON u.id = l.owner_id
                WHERE l.status = 'ACTIVE' AND u.enabled AND l.expires_at > now()
                  AND l.expires_at <= now() + interval '24 hours'
                  AND NOT EXISTS (SELECT 1 FROM notification_events e
                      WHERE e.dedup_key = 'expiry:' || l.id || ':' || extract(epoch from l.expires_at)::text)
                ORDER BY l.expires_at, l.id LIMIT 100 ON CONFLICT(dedup_key) DO NOTHING
                """);
    }

    private boolean relevant(Event event) {
        if (event.type() != NotificationType.LISTING_EXPIRING && event.type() != NotificationType.LISTING_SAVED_AGGREGATE) return true;
        String expiry = event.type() == NotificationType.LISTING_EXPIRING
                ? " AND expires_at <= now() + interval '24 hours' AND ? = 'expiry:' || id || ':' || extract(epoch from expires_at)::text"
                : "";
        Object[] args = event.type() == NotificationType.LISTING_EXPIRING
                ? new Object[] {event.subject(), event.recipient(), event.site().name(), event.key()}
                : new Object[] {event.subject(), event.recipient(), event.site().name()};
        return jdbc.queryForObject("""
                SELECT count(*) FROM listings WHERE id = ? AND owner_id = ? AND site_scope = ? AND status = 'ACTIVE'
                  AND (expires_at IS NULL OR expires_at > now())
                """ + expiry, Long.class, args) > 0;
    }
    private boolean enabled(UUID recipient) {
        return jdbc.queryForObject("SELECT count(*) FROM app_users WHERE id = ? AND enabled = true", Long.class, recipient) > 0;
    }
    private String skipReason(UUID recipient, Channel channel) {
        if (!enabled(recipient)) return "ACCOUNT_DISABLED";
        var prefs = jdbc.queryForList("SELECT push_notifications, email_updates FROM user_preferences WHERE user_id = ?", recipient);
        boolean allowed = prefs.isEmpty() ? channel == Channel.PUSH
                : Boolean.TRUE.equals(prefs.getFirst().get(channel == Channel.PUSH ? "push_notifications" : "email_updates"));
        return allowed ? null : "PREFERENCE_DISABLED";
    }
    private void completeEvent(Claim claim, String reason) {
        jdbc.update("UPDATE notification_events SET status = 'COMPLETED', completed_at = now(), error_code = ? WHERE id = ?", reason, claim.id());
    }
    private void completeDelivery(Claim claim, String status, String reason) {
        jdbc.update("UPDATE notification_deliveries SET status = ?, completed_at = now(), attempts = attempts + 1, error_code = ? WHERE id = ?",
                status, reason, claim.id());
    }
    private void retry(String table, Claim claim) {
        // Table is one of two internal constants, never request input. Do not log provider exception text.
        int attempts = claim.attempts() + 1;
        long delaySeconds = Math.min(3600L, 5L << Math.min(attempts - 1, 10));
        transaction.executeWithoutResult(tx -> jdbc.update("UPDATE " + table + """
                 SET attempts = ?, status = ?, available_at = now() + (? * interval '1 second'), error_code = 'PROCESSING_FAILED'
                 WHERE id = ? AND status = 'PENDING' AND attempts = ?
                """, attempts, attempts >= 8 ? "FAILED" : "PENDING", delaySeconds, claim.id(), claim.attempts()));
        log.warn("Notification work {} failed; attempt {} recorded", claim.id(), attempts);
    }
}
