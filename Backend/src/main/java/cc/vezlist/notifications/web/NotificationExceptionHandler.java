package cc.vezlist.notifications.web;

import java.time.Instant;
import java.util.List;
import cc.vezlist.notifications.application.NotificationException;
import cc.vezlist.shared.web.ApiError;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(-20)
@RestControllerAdvice(assignableTypes = NotificationController.class)
public class NotificationExceptionHandler {
    @ExceptionHandler(NotificationException.class)
    public ResponseEntity<ApiError> notification(NotificationException exception) {
        return ResponseEntity.status(exception.status()).body(error("NOTIFICATION_" + exception.status().name(), exception.getMessage()));
    }
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> invalid(Exception exception) {
        return ResponseEntity.badRequest().body(error("NOTIFICATION_REQUEST_INVALID", "One or more request values are invalid."));
    }
    private ApiError error(String code, String message) {
        return new ApiError(code, message, List.of(), MDC.get("traceId"), Instant.now());
    }
}
