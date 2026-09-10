package cc.vezlist.listings.application;

import java.util.UUID;

public interface ListingEventPublisher {
    void saveCountChanged(UUID listingId, int delta);
}
