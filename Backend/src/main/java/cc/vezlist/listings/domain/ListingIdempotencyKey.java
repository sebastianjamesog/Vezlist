package cc.vezlist.listings.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "listing_idempotency_keys")
public class ListingIdempotencyKey {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, length = 24)
    private String operation;

    @Column(name = "idempotency_key", nullable = false, length = 160)
    private String idempotencyKey;

    @Column(name = "request_fingerprint", nullable = false, length = 64)
    private String requestFingerprint;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ListingIdempotencyKey() {
    }

    public ListingIdempotencyKey(
            UUID ownerId, String operation, String idempotencyKey, String requestFingerprint, UUID listingId) {
        this.ownerId = ownerId;
        this.operation = operation;
        this.idempotencyKey = idempotencyKey;
        this.requestFingerprint = requestFingerprint;
        this.listingId = listingId;
    }

    @PrePersist
    void onCreate() { createdAt = Instant.now(); }

    public String getRequestFingerprint() { return requestFingerprint; }
    public UUID getListingId() { return listingId; }
}
