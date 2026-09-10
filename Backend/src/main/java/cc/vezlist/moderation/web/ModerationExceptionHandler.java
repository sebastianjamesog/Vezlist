package cc.vezlist.moderation.web;

import java.time.Instant;
import java.util.List;
import cc.vezlist.moderation.application.ModerationException;
import cc.vezlist.shared.web.ApiError;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(-10)
@RestControllerAdvice
public class ModerationExceptionHandler {
    @ExceptionHandler(ModerationException.class)
    public ResponseEntity<ApiError> handle(ModerationException exception) {
        return ResponseEntity.status(exception.status()).body(new ApiError("MODERATION_" + exception.status().name(),
                exception.getMessage(), List.of(), MDC.get("traceId"), Instant.now()));
    }
}
