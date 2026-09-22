package cc.vezlist.verification.web;

import java.time.Instant;
import java.util.UUID;

import cc.vezlist.verification.domain.VerificationPhotoStatus;
import cc.vezlist.verification.domain.VerificationRequest;
import cc.vezlist.verification.domain.VerificationRequestStatus;

public record VerificationRequestResponse(
        UUID id,
        UUID listingId,
        VerificationRequestStatus status,
        String code,
        VerificationPhotoStatus photoStatus,
        String photoRejectionReason,
        String rejectionReason,
        Instant submittedAt,
        Instant decidedAt,
        Instant createdAt) {

    public static VerificationRequestResponse from(VerificationRequest request) {
        return new VerificationRequestResponse(
                request.getId(), request.getListingId(), request.getStatus(), request.getCode(),
                request.getPhotoStatus(), request.getPhotoRejectionReason(), request.getRejectionReason(),
                request.getSubmittedAt(), request.getDecidedAt(), request.getCreatedAt());
    }
}
