package cc.vezlist.shared.web;

import java.time.Instant;
import java.util.List;

public record ApiError(
        String code,
        String message,
        List<FieldViolation> details,
        String traceId,
        Instant timestamp) {
}
