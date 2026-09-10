package cc.vezlist.moderation.web;

import java.time.Instant;
import java.util.List;
import cc.vezlist.shared.web.ApiError;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(-20)
@RestControllerAdvice(assignableTypes = {ModerationController.class, StaffModerationController.class})
public class ModerationRequestExceptionHandler {
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiError> invalidRequest(Exception exception) {
        return ResponseEntity.badRequest().body(new ApiError("MODERATION_REQUEST_INVALID",
                "One or more request values are invalid.", List.of(), MDC.get("traceId"), Instant.now()));
    }
}
