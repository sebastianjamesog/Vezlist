package cc.vezlist.listings.application;

public class IdempotencyConflictException extends RuntimeException {
    public IdempotencyConflictException() {
        super("The idempotency key was already used for a different request.");
    }
}
