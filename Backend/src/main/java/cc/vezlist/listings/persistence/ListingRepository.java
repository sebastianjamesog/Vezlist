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
    @Query(value = "SELECT EXISTS(SELECT 1 FROM moderation_cases WHERE listing_id=:listingId AND kind='APPEAL' AND status='OPEN')", nativeQuery = true)
    boolean hasOpenAppeal(@Param("listingId") UUID listingId);


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

    interface OwnedPosition {
        UUID getId();
        Long getPosition();
    }

    /** Personals shares one posting rank; Marketplace ranks within category and area. */
    @Query(value = """
            WITH ranked AS (
                SELECT l.id, l.owner_id,
                    row_number() OVER (PARTITION BY
                        CASE WHEN :site = 'PERSONALS' THEN NULL ELSE l.category_id END,
                        CASE WHEN :site = 'PERSONALS' THEN NULL ELSE l.location_id END
                        ORDER BY coalesce(l.published_at, l.created_at) DESC, l.id DESC) AS position
                FROM listings l
                JOIN app_users u ON u.id = l.owner_id AND u.enabled = true
                WHERE l.site_scope = :site AND l.status = 'ACTIVE'
                  AND (l.expires_at IS NULL OR l.expires_at > :asOf)
                  AND EXISTS (SELECT 1 FROM listings owned
                      WHERE owned.owner_id = :ownerId AND owned.site_scope = :site
                        AND owned.status = 'ACTIVE'
                        AND (:site = 'PERSONALS' OR (owned.category_id = l.category_id
                            AND owned.location_id = l.location_id)))
            )
            SELECT id, position FROM ranked WHERE owner_id = :ownerId
            """, nativeQuery = true)
    List<OwnedPosition> ownedPositions(@Param("ownerId") UUID ownerId,
            @Param("site") String site, @Param("asOf") Instant asOf);

    @EntityGraph(attributePaths = {"category", "location", "location.parent", "location.parent.parent", "attributes"})
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

    @EntityGraph(attributePaths = {"category", "location", "location.parent", "location.parent.parent", "attributes"})
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
