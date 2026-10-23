package cc.vezlist.users.domain;

import java.time.Instant;
import java.util.UUID;

import cc.vezlist.identity.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_preferences")
public class UserPreferences {

    @Id
    private UUID userId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "push_notifications", nullable = false)
    private boolean pushNotifications = true;

    @Column(name = "email_updates", nullable = false)
    private boolean emailUpdates;

    @Column(name = "available_now", nullable = false)
    private boolean availableNow;

    @Column(name = "available_until")
    private Instant availableUntil;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserPreferences() {
    }

    public UserPreferences(User user) {
        this.user = user;
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

    public void update(boolean pushNotifications, boolean emailUpdates, Boolean availableNow) {
        this.pushNotifications = pushNotifications;
        this.emailUpdates = emailUpdates;
        if (availableNow != null) {
            // Unrelated preference saves must never extend an active window.
            if (availableNow && !isAvailableNow()) availableUntil = Instant.now().plusSeconds(20 * 60);
            if (!availableNow) availableUntil = null;
            this.availableNow = availableNow;
        }
    }

    public boolean isPushNotifications() { return pushNotifications; }
    public boolean isEmailUpdates() { return emailUpdates; }
    public boolean isAvailableNow() { return availableNow && availableUntil != null && availableUntil.isAfter(Instant.now()); }
    public Instant getAvailableUntil() { return availableUntil; }
}
