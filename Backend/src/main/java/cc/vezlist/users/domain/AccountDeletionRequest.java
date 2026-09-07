package cc.vezlist.users.domain;

import java.time.Instant;
import java.util.UUID;

import cc.vezlist.identity.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "account_deletion_requests")
public class AccountDeletionRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private AccountDeletionStatus status = AccountDeletionStatus.PENDING;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected AccountDeletionRequest() {
    }

    public AccountDeletionRequest(User user) {
        this.user = user;
    }

    @PrePersist
    void onCreate() {
        requestedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public AccountDeletionStatus getStatus() { return status; }
    public Instant getRequestedAt() { return requestedAt; }
}
