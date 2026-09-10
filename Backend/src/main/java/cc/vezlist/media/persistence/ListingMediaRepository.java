package cc.vezlist.media.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import cc.vezlist.media.domain.ListingMedia;
import cc.vezlist.media.domain.ListingMediaStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ListingMediaRepository extends JpaRepository<ListingMedia, UUID> {
    List<ListingMedia> findAllByListingIdOrderByPositionAscCreatedAtAsc(UUID listingId);

    List<ListingMedia> findAllByListingIdAndStatusOrderByPositionAsc(
            UUID listingId,
            ListingMediaStatus status);

    Optional<ListingMedia> findByIdAndListingId(UUID id, UUID listingId);

    long countByListingIdAndStatusNot(UUID listingId, ListingMediaStatus status);

    long countByListingIdAndStatus(UUID listingId, ListingMediaStatus status);
}
