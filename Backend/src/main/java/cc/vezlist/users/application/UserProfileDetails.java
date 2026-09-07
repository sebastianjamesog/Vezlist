package cc.vezlist.users.application;

import java.time.Instant;
import java.util.UUID;

public record UserProfileDetails(
        UUID id,
        String name,
        String email,
        String phone,
        String location,
        String bio,
        String avatarUrl,
        boolean emailVerified,
        Instant memberSince,
        Instant updatedAt) {
}
