package cc.vezlist.verification.application;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.listings.application.ListingNotFoundException;
import cc.vezlist.listings.domain.Listing;
import cc.vezlist.listings.domain.ListingStatus;
import cc.vezlist.listings.persistence.ListingRepository;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.media.storage.StorageProperties;
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
    private final SecureRandom random = new SecureRandom();

    public VerificationService(
            ListingRepository listings,
            VerificationRequestRepository requests,
            VerificationQueryRepository queries,
            ObjectStorage storage,
            StorageProperties properties,
            ApplicationEventPublisher events,
            AdminAuditService audit) {
        this.listings = listings;
        this.requests = requests;
        this.queries = queries;
        this.storage = storage;
        this.properties = properties;
        this.events = events;
        this.audit = audit;
    }

    @Transactional
    public VerificationRequestResponse request(UUID ownerId, UUID listingId) {
        // Locking the listing row serializes concurrent requests for the same
        // listing; the partial unique index on (listing_id) WHERE status IN
        // (open) is the belt-and-suspenders guard if that lock is ever bypassed.
        Listing listing = listings.findDetailedByIdForUpdate(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        if (!listing.getOwnerId().equals(ownerId)) throw new ListingNotFoundException();
        if (!ELIGIBLE_LISTING_STATUSES.contains(listing.getStatus())) {
            throw new VerificationStateException(
                    "Only a pending or active listing can request verification.");
        }
        if (requests.findOpenForUpdate(listingId, OPEN_STATUSES).isPresent()) {
            throw new VerificationStateException("A verification request is already open for this listing.");
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
                verification.getCreatedAt());
    }

    @Transactional
    public VerificationRequestResponse decide(VezlistUserPrincipal staff, UUID requestId, VerificationDecisionRequest request) {
        VerificationRequest verification = requests.findById(requestId)
                .orElseThrow(VerificationNotFoundException::new);
        Listing listing = listings.findDetailedByIdForUpdate(verification.getListingId(), ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        if (listing.getOwnerId().equals(staff.id())) {
            throw new AccessDeniedException("You cannot review verification for your own listing.");
        }
        if (verification.getStatus() != VerificationRequestStatus.PENDING_REVIEW) {
            throw new VerificationStateException("This request has already been decided.");
        }
        if (verification.getPhotoStatus() != VerificationPhotoStatus.READY) {
            throw new VerificationStateException("The verification photo has not finished processing.");
        }
        switch (request.decision()) {
            case APPROVE -> {
                verification.approve(staff.id());
                listing.setVerified(true);
                audit.record(staff.id(), "VERIFICATION_APPROVED", "LISTING", listing.getId().toString(),
                        "Verification request " + requestId);
            }
            case REJECT -> {
                if (request.reason() == null || request.reason().isBlank()) {
                    throw new VerificationValidationException("A rejection reason is required.");
                }
                verification.reject(staff.id(), request.reason());
                audit.record(staff.id(), "VERIFICATION_REJECTED", "LISTING", listing.getId().toString(),
                        request.reason());
            }
        }
        return VerificationRequestResponse.from(verification);
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
