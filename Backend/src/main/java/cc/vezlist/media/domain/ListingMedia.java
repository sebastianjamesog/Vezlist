package cc.vezlist.media.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "listing_media")
public class ListingMedia {
    @Id
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "object_key", nullable = false, length = 320)
    private String objectKey;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "content_type", nullable = false, length = 40)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "checksum_sha256", nullable = false, length = 64)
    private String checksumSha256;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ListingMediaStatus status = ListingMediaStatus.UPLOADING;

    @Column(nullable = false)
    private int position;

    @Column(name = "upload_expires_at", nullable = false)
    private Instant uploadExpiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "ready_at")
    private Instant readyAt;

    @Column(name = "rejection_reason", length = 120)
    private String rejectionReason;

    protected ListingMedia() {
    }

    public ListingMedia(
            UUID id,
            UUID listingId,
            String objectKey,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String checksumSha256,
            int position,
            Instant uploadExpiresAt) {
        this.id = id;
        this.listingId = listingId;
        this.objectKey = objectKey;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.checksumSha256 = checksumSha256;
        this.position = position;
        this.uploadExpiresAt = uploadExpiresAt;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void processing() {
        if (status != ListingMediaStatus.UPLOADING) {
            throw new IllegalStateException("Only a pending upload can be completed.");
        }
        status = ListingMediaStatus.PROCESSING;
    }

    public void ready() {
        if (status != ListingMediaStatus.PROCESSING) {
            throw new IllegalStateException("Only a processing image can become ready.");
        }
        status = ListingMediaStatus.READY;
        readyAt = Instant.now();
        rejectionReason = null;
    }

    public void reject(String reason) {
        status = ListingMediaStatus.REJECTED;
        rejectionReason = reason;
        readyAt = null;
    }

    public void moveTo(int position) {
        this.position = position;
    }

    public void renewUpload(Instant expiresAt) {
        if (status != ListingMediaStatus.UPLOADING) {
            throw new IllegalStateException("Only a pending upload can be renewed.");
        }
        this.uploadExpiresAt = expiresAt;
    }

    public UUID getId() { return id; }
    public UUID getListingId() { return listingId; }
    public String getObjectKey() { return objectKey; }
    public String getOriginalFilename() { return originalFilename; }
    public String getContentType() { return contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public String getChecksumSha256() { return checksumSha256; }
    public ListingMediaStatus getStatus() { return status; }
    public int getPosition() { return position; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUploadExpiresAt() { return uploadExpiresAt; }
    public Instant getReadyAt() { return readyAt; }
    public String getRejectionReason() { return rejectionReason; }
}
