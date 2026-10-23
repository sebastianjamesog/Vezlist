package cc.vezlist.shared.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.Test;

class LoginAttemptLimiterTest {
    private final MutableClock clock = new MutableClock();
    private final LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock);

    @Test
    void normalizedAccountSharesTenAttemptsAcrossCallersAndIndependentAccountsDoNot() {
        for (int i = 0; i < 5; i++) {
            limiter.check(" User@Example.Test ");
            limiter.check("user@example.test");
        }
        assertThatThrownBy(() -> limiter.check("USER@EXAMPLE.TEST"))
                .isInstanceOf(LoginAttemptLimitException.class);
        assertThatCode(() -> limiter.check("other@example.test")).doesNotThrowAnyException();
    }

    @Test
    void retriesDoNotExtendWindowAndBudgetReturnsAtExactExpiry() {
        exhaust("user@example.test");
        assertThat(retryAfter("user@example.test")).isEqualTo(300);
        clock.advance(Duration.ofMillis(1501));
        assertThat(retryAfter("user@example.test")).isEqualTo(299);
        clock.advance(Duration.ofMillis(298499));
        assertThatCode(() -> limiter.check("user@example.test")).doesNotThrowAnyException();
        for (int i = 0; i < 9; i++) limiter.check("user@example.test");
        assertThat(retryAfter("user@example.test")).isEqualTo(300);
    }

    @Test
    void fullMapFailsClosedWithoutEvictingTargetAndRecoversAfterExpiry() {
        exhaust("target@example.test");
        for (int i = 1; i < 10_000; i++) limiter.check("other-" + i + "@example.test");
        assertThat(retryAfter("new-account@example.test")).isEqualTo(300);
        assertThat(retryAfter("target@example.test")).isEqualTo(300);
        // Capacity limits only new accounts, not existing accounts with budget.
        assertThatCode(() -> limiter.check("other-1@example.test")).doesNotThrowAnyException();
        clock.advance(Duration.ofMinutes(5));
        assertThatCode(() -> limiter.check("new-account@example.test")).doesNotThrowAnyException();
    }

    @Test
    void invalidAndOversizedIdentifiersCannotCreateUnboundedBuckets() {
        for (int i = 0; i < 10; i++) limiter.check(i % 2 == 0 ? null : "  ");
        assertThatThrownBy(() -> limiter.check("x".repeat(10_000)))
                .isInstanceOf(LoginAttemptLimitException.class);
        assertThatThrownBy(() -> limiter.check("y".repeat(321)))
                .isInstanceOf(LoginAttemptLimitException.class);
        assertThatCode(() -> limiter.check("valid@example.test")).doesNotThrowAnyException();
    }

    @Test
    void concurrentAttemptsCannotExceedBudget() throws Exception {
        var attempts = new ArrayList<Callable<Boolean>>();
        for (int i = 0; i < 100; i++) attempts.add(() -> {
            try {
                limiter.check("race@example.test");
                return true;
            } catch (LoginAttemptLimitException exception) {
                return false;
            }
        });
        try (var executor = Executors.newFixedThreadPool(16)) {
            int accepted = 0;
            for (var result : executor.invokeAll(attempts)) if (result.get()) accepted++;
            assertThat(accepted).isEqualTo(10);
        }
    }

    @Test
    void clockRollbackDoesNotResetBudgetOrDisruptExpiryOrdering() {
        exhaust("first@example.test");
        clock.advance(Duration.ofSeconds(-60));
        exhaust("second@example.test");
        assertThat(retryAfter("first@example.test")).isEqualTo(300);
        clock.advance(Duration.ofSeconds(360));
        assertThatCode(() -> limiter.check("first@example.test")).doesNotThrowAnyException();
        assertThatCode(() -> limiter.check("second@example.test")).doesNotThrowAnyException();
    }

    private void exhaust(String email) {
        for (int i = 0; i < 10; i++) limiter.check(email);
    }

    private long retryAfter(String email) {
        try {
            limiter.check(email);
            throw new AssertionError("Expected login to be rate limited");
        } catch (LoginAttemptLimitException exception) {
            return exception.retryAfterSeconds();
        }
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-23T00:00:00Z");
        void advance(Duration duration) { now = now.plus(duration); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
