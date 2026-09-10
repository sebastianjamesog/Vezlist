package cc.vezlist.media.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import cc.vezlist.listings.application.ListingNotFoundException;
import cc.vezlist.listings.application.ListingStateException;
import cc.vezlist.listings.domain.Listing;
import cc.vezlist.listings.domain.ListingStatus;
import cc.vezlist.listings.persistence.ListingRepository;
import cc.vezlist.media.domain.ListingMedia;
import cc.vezlist.media.domain.ListingMediaStatus;
import cc.vezlist.media.persistence.ListingMediaRepository;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.media.storage.StorageProperties;
import cc.vezlist.media.web.ListingMediaResponse;
import cc.vezlist.media.web.MediaOrderRequest;
import cc.vezlist.media.web.MediaUploadAuthorizationResponse;
import cc.vezlist.media.web.MediaUploadRequest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ListingMediaService {
    private static final int MAX_IMAGES = 6;

    private final ListingRepository listings;
    private final ListingMediaRepository media;
    private final ObjectStorage storage;
    private final StorageProperties properties;
    private final ApplicationEventPublisher events;

    public ListingMediaService(
            ListingRepository listings,
            ListingMediaRepository media,
            ObjectStorage storage,
            StorageProperties properties,
            ApplicationEventPublisher events) {
        this.listings = listings;
        this.media = media;
        this.storage = storage;
        this.properties = properties;
        this.events = events;
    }

    @Transactional
    public MediaUploadAuthorizationResponse authorizeUpload(
            UUID ownerId,
            UUID listingId,
            MediaUploadRequest request) {
        Listing listing = editableListing(ownerId, listingId);
        removeExpiredUploads(listingId);
        if (request.sizeBytes() > properties.maxImageBytes()) {
            throw new MediaValidationException("Each image must be 10 MB or smaller.");
        }
        String contentType = request.contentType().toLowerCase(Locale.ROOT);
        String checksum = request.checksumSha256().toLowerCase(Locale.ROOT);
        String fileName = safeFileName(request.fileName());
        ListingMedia reusable = media.findAllByListingIdOrderByPositionAscCreatedAtAsc(listingId).stream()
                .filter(image -> image.getStatus() != ListingMediaStatus.REJECTED)
                .filter(image -> image.getOriginalFilename().equals(fileName))
                .filter(image -> image.getContentType().equals(contentType))
                .filter(image -> image.getSizeBytes() == request.sizeBytes())
                .filter(image -> image.getChecksumSha256().equals(checksum))
                .findFirst()
                .orElse(null);
        if (reusable != null) {
            if (reusable.getStatus() == ListingMediaStatus.READY
                    || reusable.getStatus() == ListingMediaStatus.PROCESSING) {
                return new MediaUploadAuthorizationResponse(
                        reusable.getId(), null, java.util.Map.of(), null, true);
            }
            ObjectStorage.UploadTarget renewed = storage.authorizeUpload(
                    reusable.getObjectKey(), contentType, request.sizeBytes(), checksum);
            reusable.renewUpload(renewed.expiresAt());
            return new MediaUploadAuthorizationResponse(
                    reusable.getId(),
                    renewed.url().toString(),
                    renewed.headers(),
                    renewed.expiresAt(),
                    false);
        }
        if (media.countByListingIdAndStatusNot(listingId, ListingMediaStatus.REJECTED) >= MAX_IMAGES) {
            throw new MediaValidationException("A listing can have at most six images.");
        }

        UUID mediaId = UUID.randomUUID();
        String objectKey = listing.getSiteScope().name().toLowerCase(Locale.ROOT)
                + "/listings/" + listingId + "/" + mediaId + extension(contentType);
        int position = nextPosition(listingId);
        ObjectStorage.UploadTarget target = storage.authorizeUpload(
                objectKey,
                contentType,
                request.sizeBytes(),
                checksum);
        media.save(new ListingMedia(
                mediaId,
                listingId,
                objectKey,
                fileName,
                contentType,
                request.sizeBytes(),
                checksum,
                position,
                target.expiresAt()));
        return new MediaUploadAuthorizationResponse(
                mediaId,
                target.url().toString(),
                target.headers(),
                target.expiresAt(),
                false);
    }

    @Transactional
    public ListingMediaResponse complete(UUID ownerId, UUID listingId, UUID mediaId) {
        editableListing(ownerId, listingId);
        ListingMedia image = requireMedia(listingId, mediaId);
        if (image.getStatus() == ListingMediaStatus.READY
                || image.getStatus() == ListingMediaStatus.PROCESSING) {
            return response(image);
        }
        if (image.getStatus() == ListingMediaStatus.REJECTED) {
            throw new MediaStateException("The image was rejected and must be replaced.");
        }
        if (Instant.now().isAfter(image.getUploadExpiresAt())) {
            storage.delete(image.getObjectKey());
            media.delete(image);
            throw new MediaStateException("The upload URL expired. Request a new upload.");
        }
        try {
            image.processing();
        } catch (IllegalStateException exception) {
            throw new MediaStateException(exception.getMessage());
        }
        events.publishEvent(new MediaProcessingRequested(mediaId));
        return response(image);
    }

    @Transactional
    public List<ListingMediaResponse> reorder(
            UUID ownerId,
            UUID listingId,
            MediaOrderRequest request) {
        editableListing(ownerId, listingId);
        if (new HashSet<>(request.mediaIds()).size() != request.mediaIds().size()) {
            throw new MediaValidationException("Image order contains duplicates.");
        }
        if (!request.mediaIds().contains(request.coverMediaId())) {
            throw new MediaValidationException("The cover image must be in the requested order.");
        }
        List<ListingMedia> ready = media.findAllByListingIdAndStatusOrderByPositionAsc(
                listingId,
                ListingMediaStatus.READY);
        Set<UUID> expected = ready.stream().map(ListingMedia::getId).collect(java.util.stream.Collectors.toSet());
        if (!expected.equals(new HashSet<>(request.mediaIds()))) {
            throw new MediaValidationException("Order every ready image exactly once.");
        }

        List<UUID> ordered = new ArrayList<>();
        ordered.add(request.coverMediaId());
        request.mediaIds().stream()
                .filter(id -> !id.equals(request.coverMediaId()))
                .forEach(ordered::add);
        java.util.Map<UUID, ListingMedia> byId = ready.stream()
                .collect(java.util.stream.Collectors.toMap(ListingMedia::getId, value -> value));
        for (int index = 0; index < ordered.size(); index++) {
            byId.get(ordered.get(index)).moveTo(index);
        }
        return ready.stream()
                .sorted(java.util.Comparator.comparingInt(ListingMedia::getPosition))
                .map(this::response)
                .toList();
    }

    @Transactional
    public void delete(UUID ownerId, UUID listingId, UUID mediaId) {
        editableListing(ownerId, listingId);
        ListingMedia image = requireMedia(listingId, mediaId);
        storage.delete(image.getObjectKey());
        media.delete(image);
        compactPositions(listingId);
    }

    @Transactional
    public void deleteAll(UUID listingId) {
        List<ListingMedia> images = media.findAllByListingIdOrderByPositionAscCreatedAtAsc(listingId);
        for (ListingMedia image : images) {
            storage.delete(image.getObjectKey());
        }
        media.deleteAll(images);
    }

    @Transactional(readOnly = true)
    public void requireReadyImage(UUID listingId) {
        if (media.countByListingIdAndStatus(listingId, ListingMediaStatus.READY) == 0) {
            throw new MediaValidationException("Add at least one processed image before submitting.");
        }
    }

    @Transactional(readOnly = true)
    public List<ListingMediaResponse> responses(UUID listingId, boolean includePrivate) {
        return media.findAllByListingIdOrderByPositionAscCreatedAtAsc(listingId).stream()
                .filter(image -> includePrivate || image.getStatus() == ListingMediaStatus.READY)
                .map(this::response)
                .toList();
    }

    private ListingMediaResponse response(ListingMedia image) {
        String url = image.getStatus() == ListingMediaStatus.READY
                ? storage.authorizeDownload(image.getObjectKey()).toString()
                : null;
        return ListingMediaResponse.from(image, url);
    }

    private Listing editableListing(UUID ownerId, UUID listingId) {
        Listing listing = listings.findDetailedByIdForUpdate(listingId, ListingStatus.DELETED)
                .orElseThrow(ListingNotFoundException::new);
        if (!listing.getOwnerId().equals(ownerId)) throw new ListingNotFoundException();
        if (listing.getStatus() != ListingStatus.DRAFT && listing.getStatus() != ListingStatus.REJECTED) {
            throw new ListingStateException("Images can only be changed on draft or rejected listings.");
        }
        return listing;
    }

    private ListingMedia requireMedia(UUID listingId, UUID mediaId) {
        return media.findByIdAndListingId(mediaId, listingId)
                .orElseThrow(MediaNotFoundException::new);
    }

    private void removeExpiredUploads(UUID listingId) {
        Instant now = Instant.now();
        media.findAllByListingIdOrderByPositionAscCreatedAtAsc(listingId).stream()
                .filter(image -> image.getStatus() == ListingMediaStatus.UPLOADING)
                .filter(image -> now.isAfter(image.getUploadExpiresAt()))
                .toList()
                .forEach(image -> {
                    storage.delete(image.getObjectKey());
                    media.delete(image);
                });
    }

    private int nextPosition(UUID listingId) {
        Set<Integer> occupied = media.findAllByListingIdOrderByPositionAscCreatedAtAsc(listingId).stream()
                .filter(image -> image.getStatus() != ListingMediaStatus.REJECTED)
                .map(ListingMedia::getPosition)
                .collect(java.util.stream.Collectors.toSet());
        for (int position = 0; position < MAX_IMAGES; position++) {
            if (!occupied.contains(position)) return position;
        }
        throw new MediaValidationException("A listing can have at most six images.");
    }

    private void compactPositions(UUID listingId) {
        List<ListingMedia> remaining = media.findAllByListingIdOrderByPositionAscCreatedAtAsc(listingId).stream()
                .filter(image -> image.getStatus() != ListingMediaStatus.REJECTED)
                .toList();
        for (int position = 0; position < remaining.size(); position++) {
            remaining.get(position).moveTo(position);
        }
    }

    private String safeFileName(String raw) {
        String normalized = raw.replace('\\', '/');
        String name = normalized.substring(normalized.lastIndexOf('/') + 1)
                .replaceAll("[\\p{Cntrl}]", "")
                .strip();
        return name.isBlank() ? "image" : name;
    }

    private String extension(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> throw new MediaValidationException("Unsupported image type.");
        };
    }
}
