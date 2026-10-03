package cc.vezlist.listings.application;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import cc.vezlist.listings.persistence.ListingViewRepository;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ListingViewService {
    private static final int MAX_BATCH_SIZE = 50;
    private final ListingViewRepository views;

    public ListingViewService(ListingViewRepository views) {
        this.views = views;
    }

    @Transactional
    public long register(UUID listingId, SiteScope site, UUID requestId, UUID viewerId) {
        boolean inserted = views.insert(listingId, site, requestId, viewerId);
        Long count = inserted ? views.increment(listingId, site) : views.activeCount(listingId, site);
        if (count == null) throw new ListingNotFoundException();
        return count;
    }

    @Transactional(readOnly = true)
    public Map<UUID, Long> activeCounts(List<UUID> ids, SiteScope site) {
        if (ids == null || ids.isEmpty() || ids.size() > MAX_BATCH_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide between 1 and 50 listing IDs.");
        }
        return views.activeCounts(ids.stream().distinct().toList(), site);
    }
}
