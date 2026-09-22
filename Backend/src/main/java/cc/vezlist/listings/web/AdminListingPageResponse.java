package cc.vezlist.listings.web;

import java.util.List;

public record AdminListingPageResponse(
        List<AdminListingSummaryResponse> items, String nextCursor, boolean hasMore, long totalCount) {
}
