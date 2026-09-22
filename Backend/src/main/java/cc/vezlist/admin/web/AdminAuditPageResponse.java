package cc.vezlist.admin.web;

import java.util.List;

public record AdminAuditPageResponse(List<AdminAuditEntryResponse> items, String nextCursor, boolean hasMore) {
}
