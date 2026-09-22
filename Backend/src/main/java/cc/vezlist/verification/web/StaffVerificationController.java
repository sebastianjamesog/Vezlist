package cc.vezlist.verification.web;

import java.util.List;
import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.verification.application.VerificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Staff review queue for per-listing ad verification. Matches
 * {@code StaffModerationController}'s access convention exactly: reads and
 * the decision itself are both available to MODERATOR or ADMIN (moderation
 * decisions today are not ADMIN-only, so this doesn't invent a stricter rule).
 */
@RestController
@RequestMapping("/api/v1/moderation/verification-requests")
@PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
public class StaffVerificationController {
    private final VerificationService verification;

    public StaffVerificationController(VerificationService verification) {
        this.verification = verification;
    }

    @GetMapping
    List<VerificationQueueItemResponse> queue(
            @RequestParam SiteScope site,
            @RequestParam(defaultValue = "24") @Min(1) @Max(50) int limit,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int offset) {
        return verification.queue(site, limit, offset);
    }

    @GetMapping("/{id}")
    VerificationDetailResponse detail(@PathVariable UUID id) {
        return verification.detail(id);
    }

    @PostMapping("/{id}/decisions")
    VerificationRequestResponse decide(
            @AuthenticationPrincipal VezlistUserPrincipal actor,
            @PathVariable UUID id,
            @Valid @RequestBody VerificationDecisionRequest request) {
        return verification.decide(actor, id, request);
    }
}
