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
@Table(name = "user_privacy_settings")
public class UserPrivacySettings {

    @Id
    private UUID userId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "show_phone_on_ads", nullable = false)
    private boolean showPhoneOnAds = true;

    @Column(name = "precise_location", nullable = false)
    private boolean preciseLocation;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserPrivacySettings() {
    }

    public UserPrivacySettings(User user) {
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

    public void update(boolean showPhoneOnAds, boolean preciseLocation) {
        this.showPhoneOnAds = showPhoneOnAds;
        this.preciseLocation = preciseLocation;
    }

    public boolean isShowPhoneOnAds() { return showPhoneOnAds; }
    public boolean isPreciseLocation() { return preciseLocation; }
}
