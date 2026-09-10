package cc.vezlist.media.web;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record MediaUploadAuthorizationResponse(
        UUID mediaId,
        String uploadUrl,
        Map<String, String> requiredHeaders,
        Instant expiresAt,
        boolean alreadyUploaded) {
}
