package cc.vezlist.verification.web;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record VerificationUploadAuthorizationResponse(
        UUID requestId,
        String uploadUrl,
        Map<String, String> requiredHeaders,
        Instant expiresAt,
        boolean alreadyUploaded) {
}
