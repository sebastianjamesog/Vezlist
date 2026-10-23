package cc.vezlist.listings.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import cc.vezlist.catalog.application.CatalogService;
import cc.vezlist.catalog.application.EthnicityCatalogService;
import cc.vezlist.catalog.domain.Category;
import cc.vezlist.catalog.domain.Location;
import cc.vezlist.catalog.persistence.CategoryRepository;
import cc.vezlist.catalog.persistence.LocationRepository;
import cc.vezlist.listings.domain.Listing;
import cc.vezlist.listings.domain.ListingEvent;
import cc.vezlist.listings.domain.ListingIdempotencyKey;
import cc.vezlist.listings.domain.ListingStatus;
import cc.vezlist.listings.persistence.ListingEventRepository;
import cc.vezlist.listings.persistence.ListingIdempotencyKeyRepository;
import cc.vezlist.listings.persistence.ListingRepository;
import cc.vezlist.listings.web.ListingResponse;
import cc.vezlist.listings.web.ListingWriteRequest;
import cc.vezlist.media.application.ListingMediaService;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ListingService {
    private static final String CREATE = "CREATE";
    private static final String SUBMIT = "SUBMIT";

    private final ListingRepository listings;
    private final ListingIdempotencyKeyRepository idempotencyKeys;
    private final ListingEventRepository events;
    private final CategoryRepository categories;
    private final LocationRepository locations;
    private final CatalogService catalog;
    private final EthnicityCatalogService ethnicities;
    private final ObjectMapper objectMapper;
    private final ListingMediaService media;
    private final cc.vezlist.users.application.AdLocationService adLocation;

    public ListingService(
            ListingRepository listings,
            ListingIdempotencyKeyRepository idempotencyKeys,
            ListingEventRepository events,
            CategoryRepository categories,
            LocationRepository locations,
            CatalogService catalog,
            ObjectMapper objectMapper,
            ListingMediaService media, cc.vezlist.users.application.AdLocationService adLocation,
            EthnicityCatalogService ethnicities) {
        this.listings = listings;
        this.idempotencyKeys = idempotencyKeys;
        this.events = events;
        this.categories = categories;
        this.locations = locations;
        this.catalog = catalog;
        this.ethnicities = ethnicities;
        this.objectMapper = objectMapper;
        this.media = media;
        this.adLocation = adLocation;
    }

    @Transactional
    public ListingResponse create(UUID ownerId, String idempotencyKey, ListingWriteRequest request) {
        String fingerprint = fingerprint(request);
        ListingIdempotencyKey previous = idempotencyKeys
                .findByOwnerIdAndOperationAndIdempotencyKey(ownerId, CREATE, idempotencyKey)
                .orElse(null);
        if (previous != null) {
            requireSameFingerprint(previous, fingerprint);
            return response(requireListing(previous.getListingId()), true);
        }

        References references = validateReferences(request);
        var coordinates = adLocation.coordinatesFor(ownerId, request.latitude(), request.longitude());
        Listing listing = listings.save(new Listing(
                ownerId, request.site(), request.title(), request.businessName(), request.description(),
                request.price(), references.category(), request.provinceId(), references.location(),
                request.contactEmail(), request.contactPhone(), coordinates.latitude(), coordinates.longitude(),
                ethnicities.listingAttributes(request.site(), request.safeAttributes(), null)));
        events.save(new ListingEvent(listing.getId(), "LISTING_CREATED"));
        idempotencyKeys.save(new ListingIdempotencyKey(
                ownerId, CREATE, idempotencyKey, fingerprint, listing.getId()));
        return response(listing, true);
    }

    @Transactional
    public ListingResponse update(UUID ownerId, UUID listingId, ListingWriteRequest request) {
        Listing listing = listings.findDetailedByIdForUpdate(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        if (!listing.getOwnerId().equals(ownerId)) throw new ListingNotFoundException();
        if (listing.getSiteScope() != request.site()) throw new ListingNotFoundException();
        References references = validateReferences(request);
        var coordinates = !listing.getLocation().getId().equals(request.locationId()) && request.latitude() == null && request.longitude() == null
                ? new cc.vezlist.users.application.AdLocationService.Coordinates(null, null)
                : adLocation.coordinatesFor(ownerId, request.latitude(), request.longitude(), false);
        try {
            listing.update(
                    request.title(), request.businessName(), request.description(), request.price(),
                    references.category(), request.provinceId(), references.location(), request.contactEmail(),
                    request.contactPhone(), coordinates.latitude(), coordinates.longitude(),
                    ethnicities.listingAttributes(request.site(), request.safeAttributes(), listing.getAttributes().get("ethnicity")));
        } catch (IllegalStateException exception) {
            throw new ListingStateException(exception.getMessage());
        }
        events.save(new ListingEvent(listingId, "LISTING_UPDATED"));
        return response(listing, true);
    }

    @Transactional
    public ListingResponse submit(UUID ownerId, UUID listingId, String idempotencyKey, boolean requestVerification) {
        Listing listing = listings.findDetailedByIdForUpdate(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        if (!listing.getOwnerId().equals(ownerId)) throw new ListingNotFoundException();
        // Preserve legacy no-body retries while distinguishing an explicit verification submission.
        String fingerprint = fingerprint(requestVerification
                ? List.of(listingId.toString(), "VERIFICATION") : listingId.toString());
        ListingIdempotencyKey previous = idempotencyKeys
                .findByOwnerIdAndOperationAndIdempotencyKey(ownerId, SUBMIT, idempotencyKey)
                .orElse(null);
        if (previous != null) {
            requireSameFingerprint(previous, fingerprint);
            return response(listing, true);
        }

        catalog.requireEnabledCategory(listing.getSiteScope(), listing.getCategory().getId());
        catalog.requireEnabledLocation(listing.getProvinceId(), listing.getLocation().getId());
        media.requireReadyImage(listingId);
        try {
            listing.submit(requestVerification);
        } catch (IllegalStateException exception) {
            throw new ListingStateException(exception.getMessage());
        }
        events.save(new ListingEvent(listingId, requestVerification ? "LISTING_SUBMITTED" : "LISTING_PUBLISHED"));
        idempotencyKeys.save(new ListingIdempotencyKey(
                ownerId, SUBMIT, idempotencyKey, fingerprint, listingId));
        return response(listing, true);
    }

    @Transactional
    public void delete(UUID ownerId, UUID listingId) {
        Listing listing = requireOwned(ownerId, listingId);
        media.deleteAll(listingId);
        listing.delete();
        events.save(new ListingEvent(listingId, "LISTING_DELETED"));
    }

    @Transactional(readOnly = true)
    public ListingResponse detail(UUID listingId, SiteScope site, UUID requesterId) {
        Listing listing = requireListing(listingId);
        if (listing.getSiteScope() != site) throw new ListingNotFoundException();
        boolean owner = requesterId != null && requesterId.equals(listing.getOwnerId());
        if (listing.getStatus() != ListingStatus.ACTIVE && !owner) throw new ListingNotFoundException();
        return response(listing, owner);
    }

    @Transactional(readOnly = true)
    public long activeOwnedCount(UUID ownerId, SiteScope site) {
        return listings.countActiveOwned(ownerId, site.name(), Instant.now());
    }

    @Transactional(readOnly = true)
    public List<ListingResponse> owned(UUID ownerId, SiteScope site) {
        var positions = listings.ownedPositions(ownerId, site.name(), Instant.now()).stream()
                .collect(java.util.stream.Collectors.toMap(
                        ListingRepository.OwnedPosition::getId, ListingRepository.OwnedPosition::getPosition));
        return listings.findOwned(ownerId, site, ListingStatus.DELETED).stream()
                // Editing details must not move an older ad above a newer post.
                .sorted(java.util.Comparator.comparing(
                        (Listing listing) -> listing.getPublishedAt() == null
                                ? listing.getCreatedAt() : listing.getPublishedAt(),
                        java.util.Comparator.reverseOrder())
                        .thenComparing(listing -> listing.getId().toString(), java.util.Comparator.reverseOrder()))
                .map(listing -> ListingResponse.from(listing, media.responses(listing.getId(), true),
                        positions.get(listing.getId())))
                .toList();
    }

    private References validateReferences(ListingWriteRequest request) {
        catalog.requireEnabledCategory(request.site(), request.categoryId());
        catalog.requireEnabledLocation(request.provinceId(), request.locationId());
        Category category = categories.findById(request.categoryId()).orElseThrow();
        Location location = locations.findById(request.locationId()).orElseThrow();
        return new References(category, location);
    }

    private Listing requireOwned(UUID ownerId, UUID listingId) {
        Listing listing = requireListing(listingId);
        if (!listing.getOwnerId().equals(ownerId)) throw new ListingNotFoundException();
        return listing;
    }

    private Listing requireListing(UUID listingId) {
        return listings.findDetailedById(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
    }

    private void requireSameFingerprint(ListingIdempotencyKey previous, String fingerprint) {
        if (!previous.getRequestFingerprint().equals(fingerprint)) throw new IdempotencyConflictException();
    }

    private String fingerprint(Object value) {
        try {
            String json = objectMapper.writeValueAsString(value);
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Could not fingerprint listing request.", exception);
        }
    }

    private ListingResponse response(Listing listing, boolean includePrivateMedia) {
        return ListingResponse.from(
                listing,
                media.responses(listing.getId(), includePrivateMedia));
    }

    private record References(Category category, Location location) {
    }
}
