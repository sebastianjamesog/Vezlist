package cc.vezlist.shared.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

/**
 * Per-node account throttling shared by public and console logins.
 * Call before password verification on every attempt, including successful ones.
 * This complements an ingress/IP limit; it does not coordinate multiple nodes.
 */
@Service
public class LoginAttemptLimiter {
    private static final int MAX_ATTEMPTS = 10;
    private static final int MAX_ACTIVE_ACCOUNTS = 10_000;
    private static final Duration WINDOW = Duration.ofMinutes(5);
    private static final String INVALID_IDENTIFIER = "\u0000invalid-login-identifier";

    private final Clock clock;
    // Insertion order is expiry order because each window has the same duration.
    private final Map<String, AttemptWindow> windows = new LinkedHashMap<>();
    private Instant lastObservedTime = Instant.MIN;

    public LoginAttemptLimiter() {
        this(Clock.systemUTC());
    }

    public LoginAttemptLimiter(Clock clock) {
        this.clock = java.util.Objects.requireNonNull(clock);
    }

    public synchronized void check(String email) {
        Instant now = clock.instant();
        // A system-clock adjustment must not reorder deadlines or reset limits.
        if (now.isBefore(lastObservedTime)) now = lastObservedTime;
        lastObservedTime = now;
        removeExpired(now);

        String account = normalize(email);
        AttemptWindow window = windows.get(account);
        if (window == null) {
            if (windows.size() >= MAX_ACTIVE_ACCOUNTS) {
                // Never evict active accounts: filling the map must not let an
                // attacker reset a targeted account's password-attempt budget.
                throw limited(now, windows.values().iterator().next().expiresAt);
            }
            window = new AttemptWindow(now.plus(WINDOW));
            windows.put(account, window);
        }
        if (window.attempts >= MAX_ATTEMPTS) throw limited(now, window.expiresAt);
        window.attempts++;
    }

    private void removeExpired(Instant now) {
        var entries = windows.entrySet().iterator();
        while (entries.hasNext()) {
            if (entries.next().getValue().expiresAt.isAfter(now)) break;
            entries.remove();
        }
    }

    private static String normalize(String email) {
        // Bound both retained keys and normalization work even if called before
        // request validation. Invalid identifiers share one small bucket.
        if (email == null || email.length() > 512) return INVALID_IDENTIFIER;
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || normalized.length() > 320) return INVALID_IDENTIFIER;
        return normalized;
    }

    private static LoginAttemptLimitException limited(Instant now, Instant expiresAt) {
        Duration remaining = Duration.between(now, expiresAt);
        long seconds = remaining.getSeconds() + (remaining.getNano() > 0 ? 1 : 0);
        return new LoginAttemptLimitException(seconds);
    }

    private static final class AttemptWindow {
        private final Instant expiresAt;
        private int attempts;

        private AttemptWindow(Instant expiresAt) {
            this.expiresAt = expiresAt;
        }
    }
}
