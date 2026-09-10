package cc.vezlist.saved.web;

import java.util.UUID;

public record SavedStateResponse(
        UUID listingId,
        boolean saved,
        long totalCount) {
}
