package cc.vezlist.media.web;

import java.time.Instant;
import java.util.UUID;

import cc.vezlist.media.domain.ListingMedia;
import cc.vezlist.media.domain.ListingMediaStatus;

public record ListingMediaResponse(
        UUID id,
        String fileName,
        String contentType,
        long sizeBytes,
        ListingMediaStatus status,
        int position,
        boolean cover,
        String url,
        String rejectionReason,
        Instant readyAt) {

    public static ListingMediaResponse from(ListingMedia media, String url) {
        return new ListingMediaResponse(
                media.getId(),
                media.getOriginalFilename(),
                media.getContentType(),
                media.getSizeBytes(),
                media.getStatus(),
                media.getPosition(),
                media.getPosition() == 0,
                url,
                media.getRejectionReason(),
                media.getReadyAt());
    }
}
