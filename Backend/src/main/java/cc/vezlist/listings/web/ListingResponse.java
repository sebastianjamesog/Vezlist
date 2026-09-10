package cc.vezlist.listings.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import cc.vezlist.catalog.domain.Location;
import cc.vezlist.listings.domain.Listing;
import cc.vezlist.listings.domain.ListingStatus;
import cc.vezlist.shared.domain.SiteScope;

public record ListingResponse(
        UUID id,
        UUID ownerId,
        SiteScope site,
        ListingStatus status,
        String title,
        String businessName,
        String description,
        BigDecimal price,
        String categoryId,
        String categoryLabel,
        String provinceId,
        String provinceLabel,
        String locationId,
        String locationLabel,
        String contactEmail,
        String contactPhone,
        Double latitude,
        Double longitude,
        Map<String, String> attributes,
        long version,
        long viewCount,
        long saveCount,
        List<String> media,
        Instant createdAt,
        Instant updatedAt,
        Instant submittedAt,
        Instant publishedAt,
        Instant expiresAt) {

    public static ListingResponse from(Listing listing) {
        Location location = listing.getLocation();
        Location province = location.getParent();
        return new ListingResponse(
                listing.getId(), listing.getOwnerId(), listing.getSiteScope(), listing.getStatus(),
                listing.getTitle(), listing.getBusinessName(), listing.getDescription(), listing.getPrice(),
                listing.getCategory().getId(), listing.getCategory().getLabel(),
                listing.getProvinceId(), province.getLabel(), location.getId(), location.getLabel(),
                listing.getContactEmail(), listing.getContactPhone(), listing.getLatitude(), listing.getLongitude(),
                listing.getAttributes(), listing.getVersion(), 0, 0, List.of(),
                listing.getCreatedAt(), listing.getUpdatedAt(), listing.getSubmittedAt(),
                listing.getPublishedAt(), listing.getExpiresAt());
    }
}
