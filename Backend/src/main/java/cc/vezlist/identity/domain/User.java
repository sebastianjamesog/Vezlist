package cc.vezlist.identity.domain;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

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
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;

    @Column(nullable = false, unique = true, length = 320)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 32)
    private Set<Role> roles = new HashSet<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "suspended_at")
    private Instant suspendedAt;

    @Column(name = "suspension_reason", length = 200)
    private String suspensionReason;

    protected User() {
    }

    public User(String displayName, String email, String passwordHash) {
        this.displayName = displayName;
        this.email = email;
        this.passwordHash = passwordHash;
        this.roles.add(Role.USER);
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

    public UUID getId() { return id; }
    public String getDisplayName() { return displayName; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public boolean isEnabled() { return enabled; }
    public boolean isEmailVerified() { return emailVerified; }
    public Set<Role> getRoles() { return Set.copyOf(roles); }
    public Instant getCreatedAt() { return createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }

    public void updateIdentity(String displayName, String email) {
        this.displayName = displayName;
        if (!this.email.equals(email)) {
            this.email = email;
            this.emailVerified = false;
        }
    }

    public void changePassword(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public Instant getSuspendedAt() { return suspendedAt; }
    public String getSuspensionReason() { return suspensionReason; }

    public void grantRole(Role role) {
        this.roles.add(role);
    }

    /** Suspends the account: disables login/authoring app-wide (see {@code enabled}). */
    public void suspend(String reason) {
        if (!this.enabled) return;
        this.enabled = false;
        this.suspendedAt = Instant.now();
        this.suspensionReason = reason;
    }

    /** Reinstates a previously suspended account. */
    public void reinstate() {
        this.enabled = true;
        this.suspendedAt = null;
        this.suspensionReason = null;
    }
}
