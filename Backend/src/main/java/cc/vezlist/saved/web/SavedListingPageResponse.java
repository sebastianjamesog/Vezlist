package cc.vezlist.saved.web;

import java.util.List;

public record SavedListingPageResponse(
        List<SavedListingResponse> items,
        String nextCursor,
        boolean hasMore,
        long totalCount) {
}
