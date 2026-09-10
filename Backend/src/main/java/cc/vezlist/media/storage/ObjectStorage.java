package cc.vezlist.media.storage;

import java.io.InputStream;
import java.net.URI;
import java.time.Instant;
import java.util.Map;

public interface ObjectStorage {

    UploadTarget authorizeUpload(
            String objectKey,
            String contentType,
            long sizeBytes,
            String checksumSha256);

    StoredObject describe(String objectKey);

    InputStream open(String objectKey);

    URI authorizeDownload(String objectKey);

    void delete(String objectKey);

    record UploadTarget(URI url, Map<String, String> headers, Instant expiresAt) {
    }

    record StoredObject(long sizeBytes, String contentType, Map<String, String> metadata) {
    }
}
