package cc.vezlist.listings.domain;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "listing_events")
public class ListingEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "event_type", nullable = false, length = 40)
    private String eventType;

    @Column(nullable = false, columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> payload = Map.of();

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    protected ListingEvent() {
    }

    public ListingEvent(UUID listingId, String eventType) {
        this.listingId = listingId;
        this.eventType = eventType;
    }

    @PrePersist
    void onCreate() {
        occurredAt = Instant.now();
    }
}
