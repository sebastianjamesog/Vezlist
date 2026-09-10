package cc.vezlist.discovery.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import cc.vezlist.shared.domain.SiteScope;

public record DiscoveryListingResponse(
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
        Double latitude,
        Double longitude,
        Double distanceKm,
        boolean verified,
        String imageUrl,
        int photoCount,
        Instant publishedAt) {
}
