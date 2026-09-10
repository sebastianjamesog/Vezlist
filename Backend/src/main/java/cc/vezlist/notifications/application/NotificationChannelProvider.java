package cc.vezlist.notifications.application;

import java.util.UUID;
import cc.vezlist.shared.domain.SiteScope;

/** Optional integration. No external provider is installed by default. */
public interface NotificationChannelProvider {
    enum Channel { EMAIL, PUSH }
    record Delivery(UUID idempotencyKey, UUID recipientId, SiteScope site, String title, String message, String href) { }
    Channel channel();

    /** Must enforce a timeout and deduplicate using idempotencyKey, including after uncertain network failures. */
    void deliver(Delivery delivery);
}
