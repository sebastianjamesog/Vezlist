package cc.vezlist.verification.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import cc.vezlist.verification.domain.VerificationRequest;
import cc.vezlist.verification.domain.VerificationRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VerificationRequestRepository extends JpaRepository<VerificationRequest, UUID> {

    List<VerificationRequest> findAllByListingIdOrderByCreatedAtDesc(UUID listingId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from VerificationRequest r where r.listingId = :listingId "
            + "and r.status in :openStatuses")
    Optional<VerificationRequest> findOpenForUpdate(
            @Param("listingId") UUID listingId,
            @Param("openStatuses") List<VerificationRequestStatus> openStatuses);

    Optional<VerificationRequest> findFirstByListingIdOrderByCreatedAtDesc(UUID listingId);

    @Query("select r from VerificationRequest r where r.status = :status order by r.submittedAt asc, r.id asc")
    List<VerificationRequest> queue(@Param("status") VerificationRequestStatus status);
}
