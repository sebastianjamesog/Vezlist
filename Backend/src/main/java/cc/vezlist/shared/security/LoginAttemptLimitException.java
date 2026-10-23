package cc.vezlist.shared.security;

/** A login was rejected before password verification; suitable for HTTP 429. */
public final class LoginAttemptLimitException extends RuntimeException {
    private final long retryAfterSeconds;

    public LoginAttemptLimitException(long retryAfterSeconds) {
        super("Too many sign-in attempts. Please wait and try again.");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
