package cc.vezlist.listings.web;

import java.util.UUID;

public record AdminListingDetailResponse(ListingResponse listing, UUID ownerId, String ownerName, String ownerEmail) {
}
