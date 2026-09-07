package cc.vezlist.shared.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class ApiErrorTest {

    @Test
    void retainsTheStandardErrorEnvelopeFields() {
        ApiError error = new ApiError(
                "VALIDATION_ERROR",
                "One or more fields are invalid.",
                List.of(new FieldViolation("title", "Must not be blank.")),
                "request-123",
                Instant.EPOCH);

        assertEquals("VALIDATION_ERROR", error.code());
        assertEquals("title", error.details().getFirst().field());
        assertEquals("request-123", error.traceId());
    }
}
