package cc.vezlist.verification.application;

import java.util.Locale;

import cc.vezlist.media.application.ImageInspector;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.media.storage.StorageProperties;
import cc.vezlist.verification.domain.VerificationPhotoStatus;
import cc.vezlist.verification.domain.VerificationRequest;
import cc.vezlist.verification.domain.VerificationRequestStatus;
import cc.vezlist.verification.persistence.VerificationRequestRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Same checksum/content-type verification discipline as
 * {@code cc.vezlist.media.application.MediaProcessor}, applied to a
 * verification photo instead of listing gallery media.
 */
@Service
public class VerificationPhotoProcessor {
    private static final Logger log = LoggerFactory.getLogger(VerificationPhotoProcessor.class);

    private final VerificationRequestRepository requests;
    private final ObjectStorage storage;
    private final StorageProperties properties;
    private final ImageInspector inspector;

    public VerificationPhotoProcessor(
            VerificationRequestRepository requests,
            ObjectStorage storage,
            StorageProperties properties,
            ImageInspector inspector) {
        this.requests = requests;
        this.storage = storage;
        this.properties = properties;
        this.inspector = inspector;
    }

    @Transactional
    public void process(java.util.UUID requestId) {
        VerificationRequest request = requests.findByIdForUpdate(requestId).orElse(null);
        // Serialize with superseding an obsolete request after listing resubmission.
        // An asynchronous photo job must not reopen its terminal request.
        if (request == null || request.getStatus() != VerificationRequestStatus.AWAITING_PHOTO
                || request.getPhotoStatus() != VerificationPhotoStatus.PROCESSING) return;

        try {
            ObjectStorage.StoredObject stored = storage.describe(request.getPhotoObjectKey());
            ImageInspector.Inspection actual = inspector.inspect(
                    storage.open(request.getPhotoObjectKey()), properties.maxImageBytes());
            require(stored.sizeBytes() == request.getPhotoSizeBytes(), "The uploaded image size changed.");
            require(actual.sizeBytes() == request.getPhotoSizeBytes(), "The uploaded image size is invalid.");
            require(request.getPhotoContentType().equalsIgnoreCase(stored.contentType()),
                    "The uploaded content type changed.");
            require(request.getPhotoContentType().equals(actual.contentType()),
                    "The file contents do not match the selected image type.");
            require(request.getPhotoChecksumSha256().equals(actual.checksumSha256()),
                    "The uploaded image checksum does not match.");
            String storedChecksum = stored.metadata().get("sha256");
            require(storedChecksum != null
                            && request.getPhotoChecksumSha256().equals(storedChecksum.toLowerCase(Locale.ROOT)),
                    "The upload metadata checksum does not match.");
            request.photoReady();
        } catch (Exception exception) {
            log.warn("Rejecting verification photo {}: {}", requestId, exception.getMessage());
            request.photoRejected(safeReason(exception));
            try {
                storage.delete(request.getPhotoObjectKey());
            } catch (RuntimeException cleanupFailure) {
                log.warn("Could not clean rejected verification photo {}", requestId, cleanupFailure);
            }
        }
    }

    private void require(boolean condition, String message) {
        if (!condition) throw new VerificationValidationException(message);
    }

    private String safeReason(Exception exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) return "Photo validation failed.";
        return message.substring(0, Math.min(message.length(), 120));
    }
}
