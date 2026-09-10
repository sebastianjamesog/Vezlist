package cc.vezlist.discovery.web;

import java.math.BigDecimal;
import java.util.UUID;

public record DiscoveryMapPinResponse(
        UUID id,
        String title,
        String categoryId,
        BigDecimal price,
        double latitude,
        double longitude,
        double distanceKm,
        boolean verified) {
}
