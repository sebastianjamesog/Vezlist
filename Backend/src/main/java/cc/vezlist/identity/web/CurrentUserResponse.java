package cc.vezlist.identity.web;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public record CurrentUserResponse(
        UUID id,
        String name,
        String email,
        boolean emailVerified,
        Set<String> roles,
        Instant createdAt) {
}
