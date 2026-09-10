package cc.vezlist.listings.persistence;

import java.util.Optional;
import java.util.UUID;

import cc.vezlist.listings.domain.ListingIdempotencyKey;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ListingIdempotencyKeyRepository extends JpaRepository<ListingIdempotencyKey, UUID> {
    Optional<ListingIdempotencyKey> findByOwnerIdAndOperationAndIdempotencyKey(
            UUID ownerId, String operation, String idempotencyKey);
}
