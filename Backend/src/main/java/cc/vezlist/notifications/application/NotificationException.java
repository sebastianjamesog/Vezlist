package cc.vezlist.notifications.application;

import org.springframework.http.HttpStatus;

public class NotificationException extends RuntimeException {
    private final HttpStatus status;
    public NotificationException(HttpStatus status, String message) { super(message); this.status = status; }
    public HttpStatus status() { return status; }
}
