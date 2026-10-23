package cc.vezlist.listings.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import cc.vezlist.catalog.domain.Location;
import cc.vezlist.listings.domain.Listing;
import cc.vezlist.listings.domain.ListingStatus;
import cc.vezlist.media.web.ListingMediaResponse;
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
        List<ListingMediaResponse> media,
        Instant createdAt,
        Instant updatedAt,
        Instant submittedAt,
        Instant publishedAt,
        Instant expiresAt,
        boolean verified,
        boolean verificationRequested,
        Long currentPosition,
        String areaId, String areaLabel, String locationType) {

    public static ListingResponse from(Listing listing, List<ListingMediaResponse> media) {
        return from(listing, media, null);
    }

    public static ListingResponse from(Listing listing, List<ListingMediaResponse> media, Long currentPosition) {
        Location location = listing.getLocation();
        Location province = location.getProvince();
        Location area = location.getArea();
        return new ListingResponse(
                listing.getId(), listing.getOwnerId(), listing.getSiteScope(), listing.getStatus(),
                listing.getTitle(), listing.getBusinessName(), listing.getDescription(), listing.getPrice(),
                listing.getCategory().getId(), listing.getCategory().getLabel(),
                listing.getProvinceId(), province.getLabel(), location.getId(), location.getLabel(),
                listing.getContactEmail(), listing.getContactPhone(), listing.getLatitude(), listing.getLongitude(),
                listing.getAttributes(), listing.getVersion(), listing.getViewCount(), listing.getSaveCount(), media,
                listing.getCreatedAt(), listing.getUpdatedAt(), listing.getSubmittedAt(),
                listing.getPublishedAt(), listing.getExpiresAt(), listing.isVerified(), listing.isVerificationRequested(), currentPosition,
                area.getId(), area.getLabel(), location.getType().name());
    }
}
