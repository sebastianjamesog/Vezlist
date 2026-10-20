package cc.vezlist.listings.application;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.listings.domain.Listing;
import cc.vezlist.listings.domain.ListingEvent;
import cc.vezlist.listings.persistence.AdminListingRepository;
import cc.vezlist.listings.persistence.ListingEventRepository;
import cc.vezlist.listings.persistence.ListingRepository;
import cc.vezlist.listings.web.AdminListingDetailResponse;
import cc.vezlist.listings.web.AdminListingPageResponse;
import cc.vezlist.listings.web.AdminListingSummaryResponse;
import cc.vezlist.listings.web.ListingResponse;
import cc.vezlist.listings.web.RemoveListingRequest;
import cc.vezlist.media.application.ListingMediaService;
import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.shared.paging.OpaqueCursor;

@Service
public class AdminListingService {
    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 100;

    private final AdminListingRepository adminListings;
    private final ListingRepository listings;
    private final ListingEventRepository events;
    private final ListingMediaService media;
    private final AdminAuditService audit;

    public AdminListingService(
            AdminListingRepository adminListings,
            ListingRepository listings,
            ListingEventRepository events,
            ListingMediaService media,
            AdminAuditService audit) {
        this.adminListings = adminListings;
        this.listings = listings;
        this.events = events;
        this.media = media;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public AdminListingPageResponse list(
            SiteScope site, String status, String query, String encodedCursor, Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("Limit must be between 1 and " + MAX_LIMIT + ".");
        }
        OpaqueCursor.Anchor cursor = OpaqueCursor.decode(encodedCursor);
        var fetched = adminListings.page(site, status, query, cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(), limit + 1);
        boolean hasMore = fetched.size() > limit;
        var page = hasMore ? fetched.subList(0, limit) : fetched;
        String nextCursor = hasMore
                ? OpaqueCursor.encode(new OpaqueCursor.Anchor(
                        page.get(page.size() - 1).createdAt(), page.get(page.size() - 1).id()))
                : null;
        return new AdminListingPageResponse(
                page.stream().map(this::summary).toList(), nextCursor, hasMore,
                adminListings.countMatching(site, status, query));
    }

    @Transactional(readOnly = true)
    public AdminListingDetailResponse detail(UUID id) {
        Listing listing = listings.findDetailedById(id, cc.vezlist.listings.domain.ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        AdminListingRepository.OwnerInfo owner = adminListings.owner(id);
        ListingResponse response = ListingResponse.from(listing, media.responses(listing.getId(), true));
        return new AdminListingDetailResponse(
                response, owner == null ? null : owner.ownerId(),
                owner == null ? null : owner.ownerName(), owner == null ? null : owner.ownerEmail());
    }

    @Transactional
    public AdminListingDetailResponse remove(UUID actorId, UUID id, RemoveListingRequest request) {
        Listing listing = listings.findDetailedByIdForUpdate(id, cc.vezlist.listings.domain.ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        try {
            listing.adminRemove(request.reason());
        } catch (IllegalStateException exception) {
            throw new ListingStateException(exception.getMessage());
        }
        // A direct takedown resolves any open report. Otherwise it occupies the
        // unique open-case slot and an owner appeal incorrectly reuses that report.
        adminListings.closeOpenCases(id);
        events.save(new ListingEvent(id, "LISTING_REMOVED"));
        audit.record(actorId, "LISTING_REMOVED", "LISTING", id.toString(), request.reason());
        return detail(id);
    }

    private AdminListingSummaryResponse summary(AdminListingRepository.Summary row) {
        return new AdminListingSummaryResponse(
                row.id(), row.site(), row.status(), row.title(), row.businessName(), row.price(),
                row.categoryId(), row.categoryLabel(), row.ownerId(), row.ownerName(), row.ownerEmail(),
                row.createdAt(), row.updatedAt());
    }
}
