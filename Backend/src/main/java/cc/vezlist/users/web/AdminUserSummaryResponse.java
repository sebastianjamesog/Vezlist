package cc.vezlist.users.web;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public record AdminUserSummaryResponse(
        UUID id,
        String displayName,
        String email,
        Set<String> roles,
        boolean enabled,
        boolean emailVerified,
        Instant createdAt,
        long listingCount) {
}
