package cc.vezlist.users.web;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public record AdminUserDetailResponse(
        UUID id,
        String displayName,
        String email,
        Set<String> roles,
        boolean enabled,
        boolean emailVerified,
        Instant createdAt,
        Instant suspendedAt,
        String suspensionReason,
        long listingCount,
        long activeListingCount) {
}
