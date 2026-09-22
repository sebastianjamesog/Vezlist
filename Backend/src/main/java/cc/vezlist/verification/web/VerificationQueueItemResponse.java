package cc.vezlist.verification.web;

import java.time.Instant;
import java.util.UUID;

import cc.vezlist.shared.domain.SiteScope;

public record VerificationQueueItemResponse(
        UUID id,
        UUID listingId,
        String listingTitle,
        SiteScope site,
        UUID ownerId,
        String ownerEmail,
        String code,
        Instant submittedAt) {
}
