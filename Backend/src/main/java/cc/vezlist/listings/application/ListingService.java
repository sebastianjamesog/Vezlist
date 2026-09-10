package cc.vezlist.listings.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import cc.vezlist.catalog.application.CatalogService;
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
    private final ObjectMapper objectMapper;

    public ListingService(
            ListingRepository listings,
            ListingIdempotencyKeyRepository idempotencyKeys,
            ListingEventRepository events,
            CategoryRepository categories,
            LocationRepository locations,
            CatalogService catalog,
            ObjectMapper objectMapper) {
        this.listings = listings;
        this.idempotencyKeys = idempotencyKeys;
        this.events = events;
        this.categories = categories;
        this.locations = locations;
        this.catalog = catalog;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ListingResponse create(UUID ownerId, String idempotencyKey, ListingWriteRequest request) {
        String fingerprint = fingerprint(request);
        ListingIdempotencyKey previous = idempotencyKeys
                .findByOwnerIdAndOperationAndIdempotencyKey(ownerId, CREATE, idempotencyKey)
                .orElse(null);
        if (previous != null) {
            requireSameFingerprint(previous, fingerprint);
            return ListingResponse.from(requireListing(previous.getListingId()));
        }

        References references = validateReferences(request);
        Listing listing = listings.save(new Listing(
                ownerId, request.site(), request.title(), request.businessName(), request.description(),
                request.price(), references.category(), request.provinceId(), references.location(),
                request.contactEmail(), request.contactPhone(), request.latitude(), request.longitude(),
                request.safeAttributes()));
        events.save(new ListingEvent(listing.getId(), "LISTING_CREATED"));
        idempotencyKeys.save(new ListingIdempotencyKey(
                ownerId, CREATE, idempotencyKey, fingerprint, listing.getId()));
        return ListingResponse.from(listing);
    }

    @Transactional
    public ListingResponse update(UUID ownerId, UUID listingId, ListingWriteRequest request) {
        Listing listing = requireOwned(ownerId, listingId);
        if (listing.getSiteScope() != request.site()) throw new ListingNotFoundException();
        References references = validateReferences(request);
        try {
            listing.update(
                    request.title(), request.businessName(), request.description(), request.price(),
                    references.category(), request.provinceId(), references.location(), request.contactEmail(),
                    request.contactPhone(), request.latitude(), request.longitude(), request.safeAttributes());
        } catch (IllegalStateException exception) {
            throw new ListingStateException(exception.getMessage());
        }
        events.save(new ListingEvent(listingId, "LISTING_UPDATED"));
        return ListingResponse.from(listing);
    }

    @Transactional
    public ListingResponse submit(UUID ownerId, UUID listingId, String idempotencyKey) {
        String fingerprint = fingerprint(listingId.toString());
        ListingIdempotencyKey previous = idempotencyKeys
                .findByOwnerIdAndOperationAndIdempotencyKey(ownerId, SUBMIT, idempotencyKey)
                .orElse(null);
        if (previous != null) {
            requireSameFingerprint(previous, fingerprint);
            return ListingResponse.from(requireOwned(ownerId, previous.getListingId()));
        }

        Listing listing = requireOwned(ownerId, listingId);
        try {
            listing.submit();
        } catch (IllegalStateException exception) {
            throw new ListingStateException(exception.getMessage());
        }
        events.save(new ListingEvent(listingId, "LISTING_SUBMITTED"));
        idempotencyKeys.save(new ListingIdempotencyKey(
                ownerId, SUBMIT, idempotencyKey, fingerprint, listingId));
        return ListingResponse.from(listing);
    }

    @Transactional
    public void delete(UUID ownerId, UUID listingId) {
        Listing listing = requireOwned(ownerId, listingId);
        listing.delete();
        events.save(new ListingEvent(listingId, "LISTING_DELETED"));
    }

    @Transactional(readOnly = true)
    public ListingResponse detail(UUID listingId, SiteScope site, UUID requesterId) {
        Listing listing = requireListing(listingId);
        if (listing.getSiteScope() != site) throw new ListingNotFoundException();
        boolean owner = requesterId != null && requesterId.equals(listing.getOwnerId());
        if (listing.getStatus() != ListingStatus.ACTIVE && !owner) throw new ListingNotFoundException();
        return ListingResponse.from(listing);
    }

    @Transactional(readOnly = true)
    public List<ListingResponse> owned(UUID ownerId, SiteScope site) {
        return listings.findOwned(ownerId, site, ListingStatus.DELETED).stream()
                .map(ListingResponse::from)
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

    private record References(Category category, Location location) {
    }
}
