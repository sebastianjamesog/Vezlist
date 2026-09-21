package cc.vezlist.admin.web;

import java.time.Instant;
import java.util.UUID;

public record AdminAuditEntryResponse(
        UUID id,
        UUID actorId,
        String actorName,
        String action,
        String targetType,
        String targetId,
        String details,
        Instant createdAt) {
}
