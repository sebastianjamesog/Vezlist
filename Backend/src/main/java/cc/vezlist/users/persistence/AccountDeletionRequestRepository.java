package cc.vezlist.users.persistence;

import java.util.Optional;
import java.util.UUID;

import cc.vezlist.users.domain.AccountDeletionRequest;
import cc.vezlist.users.domain.AccountDeletionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountDeletionRequestRepository extends JpaRepository<AccountDeletionRequest, UUID> {
    Optional<AccountDeletionRequest> findByUserIdAndStatus(UUID userId, AccountDeletionStatus status);
}
