package cc.vezlist.notifications.persistence;

import java.util.Objects;
import java.util.UUID;
import cc.vezlist.notifications.application.NotificationPublisher;
import cc.vezlist.notifications.domain.NotificationType;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DurableNotificationPublisher implements NotificationPublisher {
    private final JdbcTemplate jdbc;
    public DurableNotificationPublisher(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(UUID sourceEventId, UUID recipient, SiteScope site, NotificationType type, UUID subjectId) {
        Objects.requireNonNull(sourceEventId);
        Objects.requireNonNull(recipient);
        Objects.requireNonNull(site);
        Objects.requireNonNull(type);
        jdbc.update("""
                INSERT INTO notification_events(dedup_key, recipient_id, site_scope, event_type, subject_id)
                VALUES (?, ?, ?, ?, ?) ON CONFLICT(dedup_key) DO NOTHING
                """, "internal:" + sourceEventId + ":" + recipient + ":" + site, recipient, site.name(), type.name(), subjectId);
    }
}
