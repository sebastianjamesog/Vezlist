package cc.vezlist.saved.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import cc.vezlist.shared.domain.SiteScope;

public record SavedListingResponse(
        UUID id,
        SiteScope site,
        String title,
        String businessName,
        BigDecimal price,
        String categoryId,
        String categoryLabel,
        String provinceId,
        String provinceLabel,
        String locationId,
        String locationLabel,
        boolean verified,
        String imageUrl,
        int photoCount,
        Instant publishedAt,
        Instant savedAt) {
}
