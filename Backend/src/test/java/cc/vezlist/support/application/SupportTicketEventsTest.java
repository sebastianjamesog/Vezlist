package cc.vezlist.support.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.io.IOException;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import cc.vezlist.shared.domain.SiteScope;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class SupportTicketEventsTest {
    @Test void aBlockedNetworkWriteCannotBlockPublishingOrExpiryOfOtherConnections() throws Exception {
        SlowEmitter slow = new SlowEmitter();
        CountDownLatch fastCompleted = new CountDownLatch(1);
        AtomicInteger created = new AtomicInteger();
        SupportTicketEvents events = new SupportTicketEvents(1000) {
            @Override SseEmitter createEmitter(long timeout) {
                if (created.getAndIncrement() == 0) return slow;
                return new SseEmitter(timeout) {
                    @Override public void send(SseEventBuilder event) { }
                    @Override public void complete() { fastCompleted.countDown(); }
                };
            }
        };
        try {
            UUID owner = UUID.randomUUID();
            events.subscribe(owner, SiteScope.MARKETPLACE, false);
            assertTimeoutPreemptively(Duration.ofSeconds(1), () -> events.changed(
                    new SupportTicketChanged(UUID.randomUUID(), owner, SiteScope.MARKETPLACE, null, null)));
            assertThat(slow.writing.await(1, TimeUnit.SECONDS)).isTrue();
            events.subscribe(UUID.randomUUID(), SiteScope.MARKETPLACE, false);
            // Expiry completion for the slow emitter must not seize the timer's
            // thread; a different subscriber still expires on schedule.
            assertThat(fastCompleted.await(3, TimeUnit.SECONDS)).isTrue();
        } finally {
            slow.release.countDown();
            events.shutdown();
        }
    }

    private static final class SlowEmitter extends SseEmitter {
        final Object writeLock = new Object();
        final CountDownLatch writing = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final AtomicInteger sends = new AtomicInteger();
        @Override public void send(SseEventBuilder event) throws IOException {
            if (sends.incrementAndGet() == 1) return;
            synchronized (writeLock) {
                writing.countDown();
                try { release.await(); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IOException(exception); }
            }
        }
        @Override public void complete() { synchronized (writeLock) { } }
    }
}
