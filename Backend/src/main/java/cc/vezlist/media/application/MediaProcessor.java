package cc.vezlist.media.application;

import java.util.Locale;

import cc.vezlist.media.domain.ListingMedia;
import cc.vezlist.media.domain.ListingMediaStatus;
import cc.vezlist.media.persistence.ListingMediaRepository;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.media.storage.StorageProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaProcessor {
    private static final Logger log = LoggerFactory.getLogger(MediaProcessor.class);

    private final ListingMediaRepository media;
    private final ObjectStorage storage;
    private final StorageProperties properties;
    private final ImageInspector inspector;

    public MediaProcessor(
            ListingMediaRepository media,
            ObjectStorage storage,
            StorageProperties properties,
            ImageInspector inspector) {
        this.media = media;
        this.storage = storage;
        this.properties = properties;
        this.inspector = inspector;
    }

    @Transactional
    public void process(java.util.UUID mediaId) {
        ListingMedia image = media.findById(mediaId).orElse(null);
        if (image == null || image.getStatus() != ListingMediaStatus.PROCESSING) return;

        try {
            ObjectStorage.StoredObject stored = storage.describe(image.getObjectKey());
            ImageInspector.Inspection actual = inspector.inspect(
                    storage.open(image.getObjectKey()),
                    properties.maxImageBytes());
            require(stored.sizeBytes() == image.getSizeBytes(), "The uploaded image size changed.");
            require(actual.sizeBytes() == image.getSizeBytes(), "The uploaded image size is invalid.");
            require(image.getContentType().equalsIgnoreCase(stored.contentType()),
                    "The uploaded content type changed.");
            require(image.getContentType().equals(actual.contentType()),
                    "The file contents do not match the selected image type.");
            require(image.getChecksumSha256().equals(actual.checksumSha256()),
                    "The uploaded image checksum does not match.");
            String storedChecksum = stored.metadata().get("sha256");
            require(storedChecksum != null
                            && image.getChecksumSha256().equals(storedChecksum.toLowerCase(Locale.ROOT)),
                    "The upload metadata checksum does not match.");
            image.ready();
        } catch (Exception exception) {
            log.warn("Rejecting media {}: {}", mediaId, exception.getMessage());
            image.reject(safeReason(exception));
            try {
                storage.delete(image.getObjectKey());
            } catch (RuntimeException cleanupFailure) {
                log.warn("Could not clean rejected media {}", mediaId, cleanupFailure);
            }
        }
    }

    private void require(boolean condition, String message) {
        if (!condition) throw new MediaValidationException(message);
    }

    private String safeReason(Exception exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) return "Image validation failed.";
        return message.substring(0, Math.min(message.length(), 120));
    }
}
