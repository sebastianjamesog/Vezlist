package cc.vezlist.notifications.application;

import java.util.UUID;
import cc.vezlist.notifications.domain.NotificationType;
import cc.vezlist.shared.domain.SiteScope;

/** Trusted module boundary. Call inside the transaction that caused the event. */
public interface NotificationPublisher {
    void publish(UUID sourceEventId, UUID recipient, SiteScope site, NotificationType type, UUID subjectId);
}
