package cc.vezlist.listings.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import cc.vezlist.listings.domain.Listing;
import cc.vezlist.listings.domain.ListingStatus;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface ListingRepository extends JpaRepository<Listing, UUID> {

    @EntityGraph(attributePaths = {"category", "location", "location.parent", "attributes"})
    @Query("select listing from Listing listing where listing.id = :id and listing.status <> :deleted")
    Optional<Listing> findDetailedById(
            @Param("id") UUID id,
            @Param("deleted") ListingStatus deleted);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {"category", "location", "location.parent", "attributes"})
    @Query("select listing from Listing listing where listing.id = :id and listing.status <> :deleted")
    Optional<Listing> findDetailedByIdForUpdate(
            @Param("id") UUID id,
            @Param("deleted") ListingStatus deleted);

    @EntityGraph(attributePaths = {"category", "location", "location.parent", "attributes"})
    @Query("""
            select distinct listing from Listing listing
            where listing.ownerId = :ownerId
              and listing.siteScope = :site
              and listing.status <> :deleted
            order by listing.updatedAt desc
            """)
    List<Listing> findOwned(
            @Param("ownerId") UUID ownerId,
            @Param("site") SiteScope site,
            @Param("deleted") ListingStatus deleted);
}
