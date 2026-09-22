package cc.vezlist.verification.web;

import java.time.Instant;
import java.util.UUID;

import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.verification.domain.VerificationRequestStatus;

public record VerificationDetailResponse(
        UUID id,
        UUID listingId,
        String listingTitle,
        SiteScope site,
        UUID ownerId,
        String ownerEmail,
        String code,
        VerificationRequestStatus status,
        String photoUrl,
        String rejectionReason,
        Instant submittedAt,
        Instant decidedAt,
        Instant createdAt) {
}
