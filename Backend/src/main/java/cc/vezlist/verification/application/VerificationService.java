package cc.vezlist.verification.application;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.catalog.application.CatalogService;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import cc.vezlist.identity.persistence.UserRepository;
import cc.vezlist.listings.application.ListingNotFoundException;
import cc.vezlist.listings.domain.Listing;
import cc.vezlist.listings.domain.ListingEvent;
import cc.vezlist.listings.domain.ListingStatus;
import cc.vezlist.listings.persistence.ListingRepository;
import cc.vezlist.listings.persistence.ListingEventRepository;
import cc.vezlist.media.application.ListingMediaService;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.media.storage.StorageProperties;
import cc.vezlist.moderation.domain.ModerationPolicy.PublicReason;
import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.verification.domain.VerificationPhotoStatus;
import cc.vezlist.verification.domain.VerificationRequest;
import cc.vezlist.verification.domain.VerificationRequestStatus;
import cc.vezlist.verification.persistence.VerificationQueryRepository;
import cc.vezlist.verification.persistence.VerificationRequestRepository;
import cc.vezlist.verification.web.VerificationDecisionRequest;
import cc.vezlist.verification.web.VerificationDetailResponse;
import cc.vezlist.verification.web.VerificationQueueItemResponse;
import cc.vezlist.verification.web.VerificationRequestResponse;
import cc.vezlist.verification.web.VerificationUploadAuthorizationResponse;
import cc.vezlist.verification.web.VerificationUploadRequest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VerificationService {
    private static final List<VerificationRequestStatus> OPEN_STATUSES =
            List.of(VerificationRequestStatus.AWAITING_PHOTO, VerificationRequestStatus.PENDING_REVIEW);
    private static final List<ListingStatus> ELIGIBLE_LISTING_STATUSES =
            List.of(ListingStatus.PENDING_REVIEW, ListingStatus.ACTIVE);

    private final ListingRepository listings;
    private final VerificationRequestRepository requests;
    private final VerificationQueryRepository queries;
    private final ObjectStorage storage;
    private final StorageProperties properties;
    private final ApplicationEventPublisher events;
    private final AdminAuditService audit;
    private final CatalogService catalog;
    private final ListingMediaService media;
    private final UserRepository users;
    private final ListingEventRepository listingEvents;
    private final SecureRandom random = new SecureRandom();

    public VerificationService(
            ListingRepository listings,
            VerificationRequestRepository requests,
            VerificationQueryRepository queries,
            ObjectStorage storage,
            StorageProperties properties,
            ApplicationEventPublisher events,
            AdminAuditService audit,
            CatalogService catalog,
            ListingMediaService media,
            UserRepository users,
            ListingEventRepository listingEvents) {
        this.listings = listings;
        this.requests = requests;
        this.queries = queries;
        this.storage = storage;
        this.properties = properties;
        this.events = events;
        this.audit = audit;
        this.catalog = catalog;
        this.media = media;
        this.users = users;
        this.listingEvents = listingEvents;
    }

    @Transactional
    public VerificationRequestResponse request(UUID ownerId, UUID listingId) {
        // Locking the listing row serializes concurrent requests for the same
        // listing; the partial unique index on (listing_id) WHERE status IN
        // (open) is the belt-and-suspenders guard if that lock is ever bypassed.
        Listing listing = listings.findDetailedByIdForUpdate(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        if (!listing.getOwnerId().equals(ownerId)) throw new ListingNotFoundException();
        requireReviewableListing(listing);
        VerificationRequest open = requests.findOpenForUpdate(listingId, OPEN_STATUSES).orElse(null);
        if (open != null) {
            if (!predatesSubmission(listing, open)) {
                throw new VerificationStateException("A verification request is already open for this listing.");
            }
            open.supersede();
            // Hibernate inserts before updates; release the partial unique index
            // before inserting the replacement request, in this same transaction.
            requests.flush();
        }
        try {
            VerificationRequest saved = requests.save(new VerificationRequest(listingId, ownerId, generateCode()));
            return VerificationRequestResponse.from(saved);
        } catch (DataIntegrityViolationException conflict) {
            throw new VerificationStateException("A verification request is already open for this listing.");
        }
    }

    @Transactional
    public VerificationUploadAuthorizationResponse authorizeUpload(
            UUID ownerId, UUID listingId, UUID requestId, VerificationUploadRequest request) {
        Listing listing = listings.findDetailedById(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        VerificationRequest verification = ownedRequest(ownerId, listingId, requestId);
        if (verification.getStatus() != VerificationRequestStatus.AWAITING_PHOTO) {
            throw new VerificationStateException("This request is not awaiting a photo.");
        }
        if (request.sizeBytes() > properties.maxImageBytes()) {
            throw new VerificationValidationException("The photo must be 10 MB or smaller.");
        }
        String contentType = request.contentType().toLowerCase(Locale.ROOT);
        String checksum = request.checksumSha256().toLowerCase(Locale.ROOT);
        if (verification.getPhotoStatus() == VerificationPhotoStatus.UPLOADING
                && checksum.equals(verification.getPhotoChecksumSha256())
                && contentType.equals(verification.getPhotoContentType())
                && request.sizeBytes() == verification.getPhotoSizeBytes()
                && Instant.now().isBefore(verification.getPhotoUploadExpiresAt())) {
            ObjectStorage.UploadTarget renewed = storage.authorizeUpload(
                    verification.getPhotoObjectKey(), contentType, request.sizeBytes(), checksum);
            verification.renewPhotoUpload(renewed.expiresAt());
            return new VerificationUploadAuthorizationResponse(
                    verification.getId(), renewed.url().toString(), renewed.headers(), renewed.expiresAt(), false);
        }
        String objectKey = listing.getSiteScope().name().toLowerCase(Locale.ROOT)
                + "/verification/" + listingId + "/" + verification.getId() + extension(contentType);
        ObjectStorage.UploadTarget target = storage.authorizeUpload(objectKey, contentType, request.sizeBytes(), checksum);
        verification.authorizePhotoUpload(
                objectKey, safeFileName(request.fileName()), contentType, request.sizeBytes(), checksum, target.expiresAt());
        return new VerificationUploadAuthorizationResponse(
                verification.getId(), target.url().toString(), target.headers(), target.expiresAt(), false);
    }

    @Transactional
    public VerificationRequestResponse completeUpload(UUID ownerId, UUID listingId, UUID requestId) {
        VerificationRequest verification = ownedRequest(ownerId, listingId, requestId);
        if (verification.getPhotoStatus() == VerificationPhotoStatus.PROCESSING
                || verification.getPhotoStatus() == VerificationPhotoStatus.READY) {
            return VerificationRequestResponse.from(verification);
        }
        if (verification.getPhotoStatus() != VerificationPhotoStatus.UPLOADING) {
            throw new VerificationStateException("Request an upload URL before completing it.");
        }
        if (Instant.now().isAfter(verification.getPhotoUploadExpiresAt())) {
            storage.delete(verification.getPhotoObjectKey());
            verification.resetForRetry();
            throw new VerificationStateException("The upload URL expired. Request a new upload.");
        }
        verification.beginProcessingPhoto();
        events.publishEvent(new VerificationPhotoProcessingRequested(requestId));
        return VerificationRequestResponse.from(verification);
    }

    @Transactional(readOnly = true)
    public VerificationRequestResponse current(UUID ownerId, UUID listingId) {
        Listing listing = listings.findDetailedById(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        if (!listing.getOwnerId().equals(ownerId)) throw new ListingNotFoundException();
        VerificationRequest verification = requests.findFirstByListingIdOrderByCreatedAtDesc(listingId)
                .orElseThrow(VerificationNotFoundException::new);
        if (predatesSubmission(listing, verification)) throw new VerificationNotFoundException();
        return VerificationRequestResponse.from(verification);
    }

    @Transactional(readOnly = true)
    public List<VerificationQueueItemResponse> queue(SiteScope site, int limit, int offset) {
        return queries.queue(site, limit, offset).stream()
                .map(row -> new VerificationQueueItemResponse(
                        row.id(), row.listingId(), row.listingTitle(), row.site(),
                        row.ownerId(), row.ownerEmail(), row.code(), row.submittedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public VerificationDetailResponse detail(UUID requestId) {
        VerificationRequest verification = requests.findById(requestId)
                .orElseThrow(VerificationNotFoundException::new);
        VerificationQueryRepository.DetailRow row = queries.detail(requestId)
                .orElseThrow(VerificationNotFoundException::new);
        String photoUrl = verification.getPhotoStatus() == VerificationPhotoStatus.READY
                ? storage.authorizeDownload(verification.getPhotoObjectKey()).toString()
                : null;
        return new VerificationDetailResponse(
                verification.getId(), row.listingId(), row.listingTitle(), row.site(),
                row.ownerId(), row.ownerEmail(), verification.getCode(), verification.getStatus(), photoUrl,
                verification.getRejectionReason(), verification.getSubmittedAt(), verification.getDecidedAt(),
                verification.getCreatedAt(), media.responses(row.listingId(), false));
    }

    @Transactional
    public VerificationRequestResponse decide(VezlistUserPrincipal staff, UUID requestId, VerificationDecisionRequest request) {
        requireStaff(staff.id());
        UUID listingId = requests.findListingIdById(requestId)
                .orElseThrow(VerificationNotFoundException::new);
        Listing listing = listings.findDetailedByIdForUpdate(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        // Read the request only after acquiring the listing lock. Concurrent
        // reviewers must see a committed decision, not an earlier JPA snapshot.
        VerificationRequest verification = requests.findByIdForUpdate(requestId)
                .orElseThrow(VerificationNotFoundException::new);
        if (listing.getOwnerId().equals(staff.id())) {
            throw new AccessDeniedException("You cannot review verification for your own listing.");
        }
        if (verification.getStatus() != VerificationRequestStatus.PENDING_REVIEW) {
            throw new VerificationStateException("This request has already been decided.");
        }
        if (verification.getPhotoStatus() != VerificationPhotoStatus.READY) {
            throw new VerificationStateException("The verification photo has not finished processing.");
        }
        requireReviewableListing(listing);
        if (predatesSubmission(listing, verification)) {
            throw new VerificationStateException("The listing was resubmitted after this verification request.");
        }
        boolean publishAfterVerification = listing.getStatus() == ListingStatus.PENDING_REVIEW
                && listing.isVerificationRequested();
        switch (request.decision()) {
            case APPROVE -> {
                media.verifyPhotos(listing.getId(), request.verifiedMediaIds());
                if (publishAfterVerification) {
                    catalog.requireEnabledCategory(listing.getSiteScope(), listing.getCategory().getId());
                    catalog.requireEnabledLocation(listing.getProvinceId(), listing.getLocation().getId());
                    media.requireReadyImage(listing.getId());
                    listing.approveVerification();
                    listingEvents.save(new ListingEvent(listing.getId(), "LISTING_APPROVED"));
                } else {
                    // Existing ACTIVE badge requests and legacy pending listings
                    // do not gain a new publication or expiry date here.
                    listing.setVerified(true);
                }
                verification.approve(staff.id());
                audit.record(staff.id(), "VERIFICATION_APPROVED", "LISTING", listing.getId().toString(),
                        "Verification request " + requestId);
            }
            case REJECT -> {
                if (request.reason() == null || request.reason().isBlank()) {
                    throw new VerificationValidationException("A rejection reason is required.");
                }
                media.verifyPhotos(listing.getId(), List.of());
                verification.reject(staff.id(), request.reason());
                if (publishAfterVerification) {
                    listing.rejectVerification(PublicReason.ELIGIBILITY_NOT_CONFIRMED);
                    listingEvents.save(new ListingEvent(listing.getId(), "LISTING_REJECTED"));
                } else {
                    listing.setVerified(false);
                }
                audit.record(staff.id(), "VERIFICATION_REJECTED", "LISTING", listing.getId().toString(),
                        request.reason());
            }
        }
        return VerificationRequestResponse.from(verification);
    }

    private boolean predatesSubmission(Listing listing, VerificationRequest verification) {
        return listing.getSubmittedAt() != null
                && verification.getCreatedAt().isBefore(listing.getSubmittedAt());
    }

    private void requireReviewableListing(Listing listing) {
        if (!ELIGIBLE_LISTING_STATUSES.contains(listing.getStatus())
                || (listing.getStatus() == ListingStatus.ACTIVE && listing.getExpiresAt() != null
                    && !listing.getExpiresAt().isAfter(Instant.now()))
                || users.findById(listing.getOwnerId()).filter(user -> user.isEnabled()).isEmpty()) {
            throw new VerificationStateException("This listing is no longer available for verification.");
        }
    }

    private void requireStaff(UUID staffId) {
        if (users.findById(staffId).filter(user -> user.isEnabled()
                && (user.getRoles().contains(Role.MODERATOR) || user.getRoles().contains(Role.ADMIN))).isEmpty()) {
            throw new AccessDeniedException("Staff access is required.");
        }
    }

    private VerificationRequest ownedRequest(UUID ownerId, UUID listingId, UUID requestId) {
        VerificationRequest verification = requests.findById(requestId)
                .orElseThrow(VerificationNotFoundException::new);
        if (!verification.getListingId().equals(listingId) || !verification.getOwnerId().equals(ownerId)) {
            throw new VerificationNotFoundException();
        }
        return verification;
    }

    private String generateCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }

    private String safeFileName(String raw) {
        String normalized = raw.replace('\\', '/');
        String name = normalized.substring(normalized.lastIndexOf('/') + 1)
                .replaceAll("[\\p{Cntrl}]", "")
                .strip();
        return name.isBlank() ? "verification.jpg" : name;
    }

    private String extension(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> throw new VerificationValidationException("Unsupported image type.");
        };
    }
}
