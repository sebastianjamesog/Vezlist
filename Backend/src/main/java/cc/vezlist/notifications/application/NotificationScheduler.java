package cc.vezlist.notifications.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "vezlist.notifications.worker-enabled", havingValue = "true", matchIfMissing = true)
public class NotificationScheduler {
    private static final Logger log = LoggerFactory.getLogger(NotificationScheduler.class);
    private final NotificationProcessor processor;
    public NotificationScheduler(NotificationProcessor processor) { this.processor = processor; }

    @Scheduled(fixedDelayString = "${vezlist.notifications.poll-ms:5000}", initialDelayString = "${vezlist.notifications.poll-ms:5000}")
    public void process() {
        try {
            for (int i = 0; i < 50 && processor.processNextEvent(); i++) { }
            for (int i = 0; i < 100 && processor.processNextDelivery(); i++) { }
        } catch (RuntimeException unavailable) {
            log.warn("Notification processing temporarily unavailable; the next poll will retry");
        }
    }
    @Scheduled(fixedDelayString = "${vezlist.notifications.expiry-poll-ms:60000}", initialDelay = 10000)
    public void expiry() {
        try { processor.queueExpiringListings(); }
        catch (RuntimeException unavailable) { log.warn("Notification expiry scan temporarily unavailable; the next scan will retry"); }
    }
}
