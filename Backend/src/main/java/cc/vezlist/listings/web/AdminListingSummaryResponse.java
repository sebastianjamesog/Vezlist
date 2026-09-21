package cc.vezlist.listings.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import cc.vezlist.shared.domain.SiteScope;

public record AdminListingSummaryResponse(
        UUID id,
        SiteScope site,
        String status,
        String title,
        String businessName,
        BigDecimal price,
        String categoryId,
        String categoryLabel,
        UUID ownerId,
        String ownerName,
        String ownerEmail,
        Instant createdAt,
        Instant updatedAt) {
}
