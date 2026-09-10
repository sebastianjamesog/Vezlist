package cc.vezlist.discovery.web;

import java.util.List;

public record DiscoveryPageResponse(
        List<DiscoveryListingResponse> items,
        String nextCursor,
        boolean hasMore) {
}
