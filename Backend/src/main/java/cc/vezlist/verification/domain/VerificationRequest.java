package cc.vezlist.verification.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A single seller-initiated request to have one specific listing marked
 * verified. Deliberately separate from {@code cc.vezlist.moderation}: see the
 * comment at the top of {@code V14__create_listing_verification.sql} for why.
 */
@Entity
@Table(name = "listing_verification_requests")
public class VerificationRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, length = 6)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VerificationRequestStatus status = VerificationRequestStatus.AWAITING_PHOTO;

    @Column(name = "photo_object_key", length = 320)
    private String photoObjectKey;

    @Column(name = "photo_original_filename", length = 255)
    private String photoOriginalFilename;

    @Column(name = "photo_content_type", length = 40)
    private String photoContentType;

    @Column(name = "photo_size_bytes")
    private Long photoSizeBytes;

    @Column(name = "photo_checksum_sha256", length = 64)
    private String photoChecksumSha256;

    @Enumerated(EnumType.STRING)
    @Column(name = "photo_status", nullable = false, length = 20)
    private VerificationPhotoStatus photoStatus = VerificationPhotoStatus.NONE;

    @Column(name = "photo_upload_expires_at")
    private Instant photoUploadExpiresAt;

    @Column(name = "photo_rejection_reason", length = 160)
    private String photoRejectionReason;

    @Column(name = "rejection_reason", length = 300)
    private String rejectionReason;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected VerificationRequest() {
    }

    public VerificationRequest(UUID listingId, UUID ownerId, String code) {
        this.listingId = listingId;
        this.ownerId = ownerId;
        this.code = code;
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

    public void authorizePhotoUpload(
            String objectKey, String originalFilename, String contentType,
            long sizeBytes, String checksumSha256, Instant expiresAt) {
        if (status != VerificationRequestStatus.AWAITING_PHOTO) {
            throw new IllegalStateException("A photo can only be uploaded while awaiting one.");
        }
        this.photoObjectKey = objectKey;
        this.photoOriginalFilename = originalFilename;
        this.photoContentType = contentType;
        this.photoSizeBytes = sizeBytes;
        this.photoChecksumSha256 = checksumSha256;
        this.photoStatus = VerificationPhotoStatus.UPLOADING;
        this.photoUploadExpiresAt = expiresAt;
        this.photoRejectionReason = null;
    }

    public void renewPhotoUpload(Instant expiresAt) {
        if (photoStatus != VerificationPhotoStatus.UPLOADING) {
            throw new IllegalStateException("Only a pending upload can be renewed.");
        }
        this.photoUploadExpiresAt = expiresAt;
    }

    public void beginProcessingPhoto() {
        if (status != VerificationRequestStatus.AWAITING_PHOTO || photoStatus != VerificationPhotoStatus.UPLOADING) {
            throw new IllegalStateException("Only a freshly uploaded photo can be submitted for processing.");
        }
        photoStatus = VerificationPhotoStatus.PROCESSING;
    }

    public void photoReady() {
        if (photoStatus != VerificationPhotoStatus.PROCESSING) {
            throw new IllegalStateException("Only a processing photo can become ready.");
        }
        photoStatus = VerificationPhotoStatus.READY;
        photoRejectionReason = null;
        status = VerificationRequestStatus.PENDING_REVIEW;
        submittedAt = Instant.now();
    }

    public void photoRejected(String reason) {
        photoStatus = VerificationPhotoStatus.REJECTED;
        photoRejectionReason = reason;
    }

    public void resetForRetry() {
        photoObjectKey = null;
        photoOriginalFilename = null;
        photoContentType = null;
        photoSizeBytes = null;
        photoChecksumSha256 = null;
        photoStatus = VerificationPhotoStatus.NONE;
        photoUploadExpiresAt = null;
    }

    public void approve(UUID staffId) {
        if (status != VerificationRequestStatus.PENDING_REVIEW) {
            throw new IllegalStateException("Only a submitted request can be approved.");
        }
        status = VerificationRequestStatus.APPROVED;
        decidedAt = Instant.now();
        decidedBy = staffId;
        rejectionReason = null;
    }

    public void reject(UUID staffId, String reason) {
        if (status != VerificationRequestStatus.PENDING_REVIEW) {
            throw new IllegalStateException("Only a submitted request can be rejected.");
        }
        status = VerificationRequestStatus.REJECTED;
        decidedAt = Instant.now();
        decidedBy = staffId;
        rejectionReason = reason;
    }

    public UUID getId() { return id; }
    public UUID getListingId() { return listingId; }
    public UUID getOwnerId() { return ownerId; }
    public String getCode() { return code; }
    public VerificationRequestStatus getStatus() { return status; }
    public String getPhotoObjectKey() { return photoObjectKey; }
    public String getPhotoOriginalFilename() { return photoOriginalFilename; }
    public String getPhotoContentType() { return photoContentType; }
    public Long getPhotoSizeBytes() { return photoSizeBytes; }
    public String getPhotoChecksumSha256() { return photoChecksumSha256; }
    public VerificationPhotoStatus getPhotoStatus() { return photoStatus; }
    public Instant getPhotoUploadExpiresAt() { return photoUploadExpiresAt; }
    public String getPhotoRejectionReason() { return photoRejectionReason; }
    public String getRejectionReason() { return rejectionReason; }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getDecidedAt() { return decidedAt; }
    public UUID getDecidedBy() { return decidedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
