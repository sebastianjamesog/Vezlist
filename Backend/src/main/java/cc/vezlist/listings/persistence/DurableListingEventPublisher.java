package cc.vezlist.listings.persistence;

import java.util.Map;
import java.util.UUID;

import cc.vezlist.listings.application.ListingEventPublisher;
import cc.vezlist.listings.domain.ListingEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DurableListingEventPublisher implements ListingEventPublisher {
    private static final String SAVE_COUNT_CHANGED = "LISTING_SAVE_COUNT_CHANGED";

    private final ListingEventRepository events;

    public DurableListingEventPublisher(ListingEventRepository events) {
        this.events = events;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void saveCountChanged(UUID listingId, int delta) {
        events.save(new ListingEvent(listingId, SAVE_COUNT_CHANGED, Map.of("delta", delta)));
    }
}
