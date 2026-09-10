package cc.vezlist.listings.persistence;

import java.util.UUID;

import cc.vezlist.listings.domain.ListingEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ListingEventRepository extends JpaRepository<ListingEvent, UUID> {
}
