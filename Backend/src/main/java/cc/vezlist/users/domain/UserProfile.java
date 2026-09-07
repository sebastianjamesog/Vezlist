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
@Table(name = "user_profiles")
public class UserProfile {

    @Id
    private UUID userId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(length = 32)
    private String phone;

    @Column(length = 150)
    private String location;

    @Column(length = 200)
    private String bio;

    @Column(name = "avatar_url", length = 2048)
    private String avatarUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserProfile() {
    }

    public UserProfile(User user) {
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

    public void update(String phone, String location, String bio) {
        this.phone = emptyToNull(phone);
        this.location = emptyToNull(location);
        this.bio = emptyToNull(bio);
    }

    private String emptyToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    public UUID getUserId() { return userId; }
    public String getPhone() { return phone; }
    public String getLocation() { return location; }
    public String getBio() { return bio; }
    public String getAvatarUrl() { return avatarUrl; }
    public Instant getUpdatedAt() { return updatedAt; }
}
