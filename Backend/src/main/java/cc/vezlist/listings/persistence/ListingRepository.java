package cc.vezlist.listings.persistence;

import java.time.Instant;
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

    @Query(value = """
            select count(*) from listings listing
            join app_users owner on owner.id = listing.owner_id and owner.enabled = true
            where listing.owner_id = :ownerId
              and listing.site_scope = :site
              and listing.status = 'ACTIVE'
              and (listing.expires_at is null or listing.expires_at > :asOf)
            """, nativeQuery = true)
    long countActiveOwned(
            @Param("ownerId") UUID ownerId,
            @Param("site") String site,
            @Param("asOf") Instant asOf);

    @EntityGraph(attributePaths = {"category", "location", "location.parent", "attributes"})
    @Query("select listing from Listing listing where listing.id = :id and listing.status <> :deleted")
    Optional<Listing> findDetailedById(
            @Param("id") UUID id,
            @Param("deleted") ListingStatus deleted);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    // Fetching collections here requires follow-on locking, which can expose a stale pre-lock snapshot.
    // Callers run in transactions and initialize associations after acquiring the listing row lock.
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
