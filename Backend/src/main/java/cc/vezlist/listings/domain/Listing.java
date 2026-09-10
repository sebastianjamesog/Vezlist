package cc.vezlist.listings.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import cc.vezlist.catalog.domain.Category;
import cc.vezlist.catalog.domain.Location;
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
        if (status != ListingStatus.DRAFT && status != ListingStatus.REJECTED) {
            throw new IllegalStateException("Only draft or rejected listings can be edited.");
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

    public void submit() {
        if (status != ListingStatus.DRAFT && status != ListingStatus.REJECTED) {
            throw new IllegalStateException("Only draft or rejected listings can be submitted.");
        }
        status = ListingStatus.PENDING_REVIEW;
        submittedAt = Instant.now();
    }

    public void delete() {
        if (status == ListingStatus.DELETED) return;
        status = ListingStatus.DELETED;
        deletedAt = Instant.now();
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
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getPublishedAt() { return publishedAt; }
    public Instant getExpiresAt() { return expiresAt; }
}
