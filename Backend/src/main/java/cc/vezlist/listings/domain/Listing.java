package cc.vezlist.listings.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import cc.vezlist.catalog.domain.Category;
import cc.vezlist.catalog.domain.Location;
import cc.vezlist.moderation.domain.ModerationPolicy.PublicReason;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "listings")
public class Listing {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "site_scope", nullable = false)
    private SiteScope siteScope;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ListingStatus status = ListingStatus.DRAFT;

    @Column(nullable = false, length = 70)
    private String title;

    @Column(name = "business_name", nullable = false, length = 120)
    private String businessName;

    @Column(nullable = false, length = 5000)
    private String description;

    @Column(precision = 12, scale = 2)
    private BigDecimal price;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(name = "province_id", nullable = false, length = 40)
    private String provinceId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    @Column(name = "contact_email", nullable = false, length = 320)
    private String contactEmail;

    @Column(name = "contact_phone", nullable = false, length = 32)
    private String contactPhone;

    private Double latitude;
    private Double longitude;

    @ElementCollection
    @CollectionTable(name = "listing_attributes", joinColumns = @JoinColumn(name = "listing_id"))
    @MapKeyColumn(name = "attribute_key", length = 80)
    @Column(name = "attribute_value", nullable = false, length = 500)
    private Map<String, String> attributes = new HashMap<>();

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "save_count", nullable = false)
    private long saveCount;

    @Column(name = "view_count", nullable = false)
    private long viewCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "moderation_reason", length = 80)
    private String moderationReason;

    @Column(name = "verified", nullable = false)
    private boolean verified;

    @Column(name = "verification_requested", nullable = false)
    private boolean verificationRequested;

    protected Listing() {
    }

    public Listing(
            UUID ownerId,
            SiteScope siteScope,
            String title,
            String businessName,
            String description,
            BigDecimal price,
            Category category,
            String provinceId,
            Location location,
            String contactEmail,
            String contactPhone,
            Double latitude,
            Double longitude,
            Map<String, String> attributes) {
        this.ownerId = ownerId;
        this.siteScope = siteScope;
        update(title, businessName, description, price, category, provinceId, location,
                contactEmail, contactPhone, latitude, longitude, attributes);
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

    public void update(
            String title,
            String businessName,
            String description,
            BigDecimal price,
            Category category,
            String provinceId,
            Location location,
            String contactEmail,
            String contactPhone,
            Double latitude,
            Double longitude,
            Map<String, String> attributes) {
        if (status != ListingStatus.DRAFT && status != ListingStatus.REJECTED
                && status != ListingStatus.ACTIVE && status != ListingStatus.EXPIRED) {
            throw new IllegalStateException("Ads awaiting review or removed by moderation cannot be edited.");
        }
        this.title = title.strip();
        this.businessName = businessName.strip();
        this.description = description.strip();
        this.price = price;
        this.category = category;
        this.provinceId = provinceId;
        this.location = location;
        this.contactEmail = contactEmail.strip().toLowerCase();
        this.contactPhone = contactPhone.strip();
        this.latitude = latitude;
        this.longitude = longitude;
        this.attributes.clear();
        if (attributes != null) this.attributes.putAll(attributes);
    }

    public void submit(boolean requestVerification) {
        if (status != ListingStatus.DRAFT && status != ListingStatus.REJECTED) {
            throw new IllegalStateException("Only draft or rejected listings can be submitted.");
        }
        verificationRequested = requestVerification;
        verified = false;
        moderationReason = null;
        submittedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        if (requestVerification) {
            status = ListingStatus.PENDING_REVIEW;
            publishedAt = null;
            expiresAt = null;
        } else {
            publish(false);
        }
    }

    public void approveVerification() {
        requirePendingVerification();
        publish(true);
    }

    public void rejectVerification(PublicReason reason) {
        requirePendingVerification();
        status = ListingStatus.REJECTED;
        verified = false;
        moderationReason = reason.name();
        publishedAt = null;
        expiresAt = null;
    }

    private void requirePendingVerification() {
        if (status != ListingStatus.PENDING_REVIEW || !verificationRequested) {
            throw new IllegalStateException("Only listings awaiting verification can receive a verification decision.");
        }
    }

    private void publish(boolean verified) {
        status = ListingStatus.ACTIVE;
        this.verified = verified;
        moderationReason = null;
        publishedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        expiresAt = publishedAt.plus(30, ChronoUnit.DAYS);
    }

    public void delete() {
        if (status == ListingStatus.DELETED) return;
        status = ListingStatus.DELETED;
        deletedAt = Instant.now();
    }

    /**
     * Administrators may remove published ads or stop a pending submission.
     * Publication and expiry dates are preserved, so removing an unpublished
     * submission never publishes it. Draft and terminal states remain guarded.
     */
    public void adminRemove(String reason) {
        if (status != ListingStatus.ACTIVE && status != ListingStatus.PENDING_REVIEW) {
            throw new IllegalStateException("Only active or pending-review listings can be force-removed.");
        }
        status = ListingStatus.REMOVED;
        moderationReason = reason;
    }

    /**
     * Flips the per-listing verification badge. Called only from
     * {@code cc.vezlist.verification} when a staff member approves or a
     * listing's verification is otherwise revoked; deliberately independent
     * of {@code app_users.seller_verified}.
     */
    public void setVerified(boolean verified) {
        this.verified = verified;
    }

    public UUID getId() { return id; }
    public UUID getOwnerId() { return ownerId; }
    public SiteScope getSiteScope() { return siteScope; }
    public ListingStatus getStatus() { return status; }
    public String getTitle() { return title; }
    public String getBusinessName() { return businessName; }
    public String getDescription() { return description; }
    public BigDecimal getPrice() { return price; }
    public Category getCategory() { return category; }
    public String getProvinceId() { return provinceId; }
    public Location getLocation() { return location; }
    public String getContactEmail() { return contactEmail; }
    public String getContactPhone() { return contactPhone; }
    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public Map<String, String> getAttributes() { return Map.copyOf(attributes); }
    public long getVersion() { return version; }
    public long getSaveCount() { return saveCount; }
    public long getViewCount() { return viewCount; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getPublishedAt() { return publishedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public String getModerationReason() { return moderationReason; }
    public boolean isVerified() { return verified; }
    public boolean isVerificationRequested() { return verificationRequested; }
}
