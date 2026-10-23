package cc.vezlist.support.application;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import cc.vezlist.shared.domain.SiteScope;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Local invalidation transport. Reconnect always refreshes durable database state. */
@Component
public class SupportTicketEvents {
    public static final String STREAM_REQUEST_ATTRIBUTE = SupportTicketEvents.class.getName() + ".stream";
    public record Payload(UUID ticketId) {}
    private final ConcurrentHashMap<UUID, Client> clients = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor writes = new ThreadPoolExecutor(4, 4, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(512), Thread.ofPlatform().daemon().name("ticket-events-write-", 0).factory());
    private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon().name("ticket-events-clock").factory());
    private final long lifetimeMs;

    public SupportTicketEvents(@Value("${vezlist.support.events-lifetime-ms:60000}") long lifetimeMs) {
        this.lifetimeMs = Math.max(1000, Math.min(60000, lifetimeMs));
        clock.scheduleAtFixedRate(this::tick, 1, 1, TimeUnit.SECONDS);
    }

    public synchronized SseEmitter subscribe(UUID actorId, SiteScope site, boolean staff) {
        if (clients.size() >= 512 || clients.values().stream()
                .filter(c -> c.actorId.equals(actorId) && c.staff == staff).count() >= 5) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many support event connections.");
        }
        Client client = new Client(actorId, site, staff, lifetimeMs, createEmitter(lifetimeMs));
        clients.put(client.id, client);
        client.emitter.onCompletion(() -> remove(client));
        // Container lifecycle callbacks already complete the response. Never call
        // complete again or wait for a slow socket while handling a timeout.
        client.emitter.onTimeout(() -> remove(client));
        client.emitter.onError(error -> remove(client));
        // Buffered by SseEmitter until MVC has installed its response handler.
        try {
            client.emitter.send(SseEmitter.event().name("tickets-changed").reconnectTime(2000).data(new Payload(null)));
        } catch (IOException | IllegalStateException exception) {
            close(client);
        }
        return client.emitter;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void changed(SupportTicketChanged event) {
        for (Client client : clients.values()) {
            if (client.site != event.site()) continue;
            if (event.readerId() != null) {
                if (!client.actorId.equals(event.readerId()) || client.staff != event.readerStaff()) continue;
            } else if (!client.staff && !client.actorId.equals(event.ownerId())) continue;
            // Coalesce bursts; null ticketId means refresh all visible ticket state.
            client.pending.updateAndGet(previous -> previous == null ? new Payload(event.ticketId())
                    : new Payload(java.util.Objects.equals(previous.ticketId(), event.ticketId()) ? event.ticketId() : null));
            enqueue(client);
        }
    }

    private void tick() {
        long now = System.nanoTime();
        for (Client client : clients.values()) {
            if (now >= client.deadline) close(client);
            else if (now - client.lastHeartbeat >= TimeUnit.SECONDS.toNanos(15)) {
                client.lastHeartbeat = now;
                enqueue(client);
            }
        }
    }

    private void enqueue(Client client) {
        if (client.closed.get() || !client.queued.compareAndSet(false, true)) return;
        try {
            writes.execute(() -> {
                try {
                    if (!client.closed.get()) {
                        Payload payload = client.pending.getAndSet(null);
                        client.emitter.send(payload == null ? SseEmitter.event().comment("heartbeat")
                                : SseEmitter.event().name("tickets-changed").data(payload));
                    }
                } catch (IOException | IllegalStateException exception) {
                    close(client);
                } finally {
                    client.queued.set(false);
                    if (client.pending.get() != null) enqueue(client);
                }
            });
        } catch (RejectedExecutionException exception) {
            client.queued.set(false);
            close(client); // A slow consumer reconnects and refreshes; never block a database transaction.
        }
    }

    SseEmitter createEmitter(long timeout) { return new SseEmitter(timeout); }

    private boolean remove(Client client) {
        clients.remove(client.id);
        return client.closed.compareAndSet(false, true);
    }

    private void close(Client client) {
        if (remove(client)) {
            // complete() can wait on the emitter network-write lock. Keep it off
            // the timer and after-commit threads; servlet timeout remains a fallback
            // if the bounded writer queue is already saturated.
            try { writes.execute(client.emitter::complete); }
            catch (RejectedExecutionException ignored) { }
        }
    }

    @PreDestroy
    void shutdown() {
        clients.values().forEach(this::close);
        clock.shutdownNow();
        writes.shutdownNow();
    }

    private static final class Client {
        final UUID id = UUID.randomUUID();
        final UUID actorId;
        final SiteScope site;
        final boolean staff;
        final SseEmitter emitter;
        final long deadline;
        volatile long lastHeartbeat = System.nanoTime();
        final AtomicBoolean closed = new AtomicBoolean();
        final AtomicBoolean queued = new AtomicBoolean();
        final AtomicReference<Payload> pending = new AtomicReference<>();
        Client(UUID actorId, SiteScope site, boolean staff, long lifetimeMs, SseEmitter emitter) {
            this.actorId = actorId;
            this.site = site;
            this.staff = staff;
            this.emitter = emitter;
            deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(lifetimeMs);
        }
    }
}
