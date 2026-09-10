package cc.vezlist.moderation.application;

import org.springframework.http.HttpStatus;

public class ModerationException extends RuntimeException {
    private final HttpStatus status;
    public ModerationException(HttpStatus status, String message) { super(message); this.status = status; }
    public HttpStatus status() { return status; }
}
