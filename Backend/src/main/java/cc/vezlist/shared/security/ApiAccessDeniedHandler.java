package cc.vezlist.shared.security;

import java.io.IOException;
import java.time.Instant;
import java.util.List;

import cc.vezlist.shared.web.ApiError;
import cc.vezlist.shared.web.TraceIdFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/**
 * The path-based {@code requestMatchers(...).hasAnyRole(...)} denials (e.g.
 * anything under /api/v1/admin/**) are thrown by the security filter chain
 * itself, before the request ever reaches DispatcherServlet - so
 * ApiExceptionHandler's @ExceptionHandler(AccessDeniedException.class),
 * which only covers method-level @PreAuthorize denials, never sees them.
 * Without this, those 403s fall back to Spring Boot's default error shape
 * instead of this API's {@link ApiError} envelope.
 */
@Component
public class ApiAccessDeniedHandler implements AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    public ApiAccessDeniedHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException exception) throws IOException {
        String traceId = MDC.get("traceId");
        if (traceId == null) {
            traceId = request.getHeader(TraceIdFilter.REQUEST_ID_HEADER);
        }
        ApiError body = new ApiError(
                "FORBIDDEN", "You do not have permission to perform this action.",
                List.of(), traceId, Instant.now());
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }
}
