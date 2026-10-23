package cc.vezlist.saved.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import cc.vezlist.listings.application.ListingEventPublisher;
import cc.vezlist.listings.application.ListingNotFoundException;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.saved.persistence.SavedListingRepository;
import cc.vezlist.saved.persistence.SavedListingRepository.SavedListingRow;
import cc.vezlist.saved.persistence.SavedListingRepository.SaveAttempt;
import cc.vezlist.saved.web.SavedListingPageResponse;
import cc.vezlist.saved.web.SavedListingResponse;
import cc.vezlist.saved.web.SavedStateResponse;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SavedListingService {
    private static final int DEFAULT_PAGE_SIZE = 24;
    private static final int MAX_PAGE_SIZE = 50;
    private final SavedListingRepository savedListings;
    private final ListingEventPublisher listingEvents;
    private final SavedListingCursorCodec cursors;
    private final ObjectStorage storage;

    public SavedListingService(
            SavedListingRepository savedListings,
            ListingEventPublisher listingEvents,
            SavedListingCursorCodec cursors,
            ObjectStorage storage) {
        this.savedListings = savedListings;
        this.listingEvents = listingEvents;
        this.cursors = cursors;
        this.storage = storage;
    }

    @Transactional
    public SavedStateResponse save(UUID userId, UUID listingId, SiteScope site) {
        Instant now = Instant.now();
        SaveAttempt attempt = savedListings.saveActive(
                UUID.randomUUID(), userId, listingId, site, now);
        if (!attempt.accessible()) throw new ListingNotFoundException();
        if (attempt.changed()) {
            savedListings.changeListingSaveCount(listingId, 1);
            listingEvents.saveCountChanged(listingId, 1);
        }
        return stateResponse(userId, listingId, site, true, now);
    }

    @Transactional
    public SavedStateResponse unsave(UUID userId, UUID listingId, SiteScope site) {
        boolean changed = savedListings.delete(userId, listingId, site);
        if (changed) {
            savedListings.changeListingSaveCount(listingId, -1);
            listingEvents.saveCountChanged(listingId, -1);
        }
        Instant now = Instant.now();
        return stateResponse(userId, listingId, site, false, now);
    }

    @Transactional(readOnly = true)
    public SavedStateResponse state(UUID userId, UUID listingId, SiteScope site) {
        Instant now = Instant.now();
        if (!savedListings.isSaveable(userId, listingId, site, now)) {
            throw new ListingNotFoundException();
        }
        return stateResponse(
                userId,
                listingId,
                site,
                savedListings.isSaved(userId, listingId),
                now);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SavedListingPageResponse list(
            UUID userId,
            SiteScope site,
            String encodedCursor,
            Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_PAGE_SIZE : requestedLimit;
        if (limit < 1 || limit > MAX_PAGE_SIZE) {
            throw new SavedListingQueryInvalidException(
                    "Limit must be between 1 and " + MAX_PAGE_SIZE + ".");
        }

        Instant asOf = Instant.now();
        SavedListingCursorCodec.CursorAnchor cursor = null;
        if (encodedCursor != null && !encodedCursor.isBlank()) {
            SavedListingCursorCodec.DecodedCursor decoded = cursors.decode(encodedCursor, userId, site);
            asOf = decoded.asOf();
            cursor = decoded.anchor();
        }

        List<SavedListingRow> fetched = savedListings.findPage(userId, site, asOf, cursor, limit + 1);
        boolean hasMore = fetched.size() > limit;
        List<SavedListingRow> pageRows = hasMore ? fetched.subList(0, limit) : fetched;
        String nextCursor = hasMore
                ? cursors.encode(userId, site, asOf, pageRows.get(pageRows.size() - 1).cursorAnchor())
                : null;
        return new SavedListingPageResponse(
                pageRows.stream().map(this::response).toList(),
                nextCursor,
                hasMore,
                savedListings.countAccessible(userId, site, asOf));
    }

    private SavedStateResponse stateResponse(
            UUID userId,
            UUID listingId,
            SiteScope site,
            boolean saved,
            Instant asOf) {
        return new SavedStateResponse(
                listingId,
                saved,
                savedListings.countAccessible(userId, site, asOf));
    }

    private SavedListingResponse response(SavedListingRow row) {
        String imageUrl = row.coverObjectKey() == null
                ? null
                : storage.authorizeDownload(row.coverObjectKey()).toString();
        return new SavedListingResponse(
                row.id(), row.site(), row.title(), row.businessName(), row.price(),
                row.categoryId(), row.categoryLabel(), row.provinceId(), row.provinceLabel(),
                row.locationId(), row.locationLabel(),
                row.verified(), imageUrl, row.photoCount(), row.publishedAt(), row.savedAt(), row.viewCount(), row.availableNow(), row.availableUntil());
    }
}
