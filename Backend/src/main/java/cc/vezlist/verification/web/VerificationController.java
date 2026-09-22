package cc.vezlist.verification.web;

import java.net.URI;
import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.verification.application.VerificationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Owner-facing per-listing verification lifecycle: request -> upload photo ->
 * poll status. Staff review lives in {@link StaffVerificationController}.
 */
@RestController
@RequestMapping("/api/v1/listings/{listingId}/verification")
public class VerificationController {
    private final VerificationService verification;

    public VerificationController(VerificationService verification) {
        this.verification = verification;
    }

    @PostMapping
    ResponseEntity<VerificationRequestResponse> request(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId) {
        VerificationRequestResponse response = verification.request(principal.id(), listingId);
        return ResponseEntity.created(
                URI.create("/api/v1/listings/" + listingId + "/verification/" + response.id())).body(response);
    }

    @GetMapping
    VerificationRequestResponse current(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId) {
        return verification.current(principal.id(), listingId);
    }

    @PostMapping("/{requestId}/photo/upload-url")
    VerificationUploadAuthorizationResponse authorizeUpload(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @PathVariable UUID requestId,
            @Valid @RequestBody VerificationUploadRequest request) {
        return verification.authorizeUpload(principal.id(), listingId, requestId, request);
    }

    @PostMapping("/{requestId}/photo/complete")
    VerificationRequestResponse completeUpload(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @PathVariable UUID requestId) {
        return verification.completeUpload(principal.id(), listingId, requestId);
    }
}
