package cc.vezlist.users.web;

import java.util.List;

public record AdminUserPageResponse(
        List<AdminUserSummaryResponse> items, String nextCursor, boolean hasMore, long totalCount) {
}
