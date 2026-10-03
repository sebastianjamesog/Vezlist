package cc.vezlist.media.storage;

import java.io.InputStream;
import java.net.URI;
import java.time.Instant;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.stereotype.Component;

import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Component
public class S3ObjectStorage implements ObjectStorage {
    private final S3Client s3;
    private final S3Presigner presigner;
    private final StorageProperties properties;
    private final AtomicBoolean bucketReady = new AtomicBoolean();

    public S3ObjectStorage(
            S3Client s3,
            S3Presigner presigner,
            StorageProperties properties) {
        this.s3 = s3;
        this.presigner = presigner;
        this.properties = properties;
    }

    @Override
    public UploadTarget authorizeUpload(
            String objectKey,
            String contentType,
            long sizeBytes,
            String checksumSha256) {
        ensureBucket();
        PutObjectRequest put = PutObjectRequest.builder()
                .bucket(properties.bucket())
                .key(objectKey)
                .contentType(contentType)
                .contentLength(sizeBytes)
                .metadata(Map.of("sha256", checksumSha256))
                .build();
        PresignedPutObjectRequest signed = presigner.presignPutObject(
                PutObjectPresignRequest.builder()
                        .signatureDuration(properties.uploadUrlTtl())
                        .putObjectRequest(put)
                        .build());
        return new UploadTarget(
                URI.create(signed.url().toString()),
                browserHeaders(signed.signedHeaders()),
                Instant.now().plus(properties.uploadUrlTtl()));
    }

    @Override
    public StoredObject describe(String objectKey) {
        try {
            HeadObjectResponse head = s3.headObject(HeadObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(objectKey)
                    .build());
            return new StoredObject(head.contentLength(), head.contentType(), head.metadata());
        } catch (RuntimeException exception) {
            throw new StorageException("The uploaded image could not be inspected.", exception);
        }
    }

    @Override
    public InputStream open(String objectKey) {
        try {
            return s3.getObject(GetObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(objectKey)
                    .build());
        } catch (RuntimeException exception) {
            throw new StorageException("The uploaded image could not be read.", exception);
        }
    }

    @Override
    public URI authorizeDownload(String objectKey) {
        return authorizeDownload(objectKey, properties.downloadUrlTtl());
    }

    @Override
    public URI authorizeDownload(String objectKey, Duration maximumTtl) {
        Duration ttl = maximumTtl.compareTo(properties.downloadUrlTtl()) < 0 ? maximumTtl : properties.downloadUrlTtl();
        if (ttl.isNegative() || ttl.isZero()) throw new IllegalArgumentException("Media has expired.");
        try {
            PresignedGetObjectRequest signed = presigner.presignGetObject(
                    GetObjectPresignRequest.builder()
                            .signatureDuration(ttl)
                            .getObjectRequest(GetObjectRequest.builder()
                                    .bucket(properties.bucket())
                                    .key(objectKey)
                                    .build())
                            .build());
            return URI.create(signed.url().toString());
        } catch (RuntimeException exception) {
            throw new StorageException("The image could not be made available.", exception);
        }
    }

    @Override
    public void store(String objectKey, String contentType, byte[] bytes) {
        ensureBucket();
        s3.putObject(PutObjectRequest.builder().bucket(properties.bucket()).key(objectKey)
                .contentType(contentType).contentLength((long) bytes.length).build(), RequestBody.fromBytes(bytes));
    }

    @Override
    public void delete(String objectKey) {
        try {
            s3.deleteObject(DeleteObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(objectKey)
                    .build());
        } catch (RuntimeException exception) {
            throw new StorageException("The image could not be removed from storage.", exception);
        }
    }

    private synchronized void ensureBucket() {
        if (bucketReady.get()) return;
        try {
            s3.headBucket(HeadBucketRequest.builder().bucket(properties.bucket()).build());
        } catch (NoSuchBucketException exception) {
            s3.createBucket(CreateBucketRequest.builder().bucket(properties.bucket()).build());
        } catch (S3Exception exception) {
            if (exception.statusCode() != 404) {
                throw new StorageException("Object storage is unavailable.", exception);
            }
            s3.createBucket(CreateBucketRequest.builder().bucket(properties.bucket()).build());
        } catch (RuntimeException exception) {
            throw new StorageException("Object storage is unavailable.", exception);
        }
        bucketReady.set(true);
    }

    private Map<String, String> browserHeaders(Map<String, List<String>> signedHeaders) {
        Map<String, String> headers = new LinkedHashMap<>();
        signedHeaders.forEach((name, values) -> {
            if (!name.equalsIgnoreCase("host") && !name.equalsIgnoreCase("content-length")) {
                headers.put(name, String.join(",", values));
            }
        });
        return Map.copyOf(headers);
    }
}
