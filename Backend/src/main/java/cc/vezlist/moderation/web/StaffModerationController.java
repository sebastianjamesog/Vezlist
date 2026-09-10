package cc.vezlist.moderation.web;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.moderation.application.ModerationService;
import cc.vezlist.moderation.application.ModerationService.*;
import cc.vezlist.moderation.web.ModerationRequests.*;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/moderation/cases")
@PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
public class StaffModerationController {
    private final ModerationService moderation;
    public StaffModerationController(ModerationService moderation) { this.moderation = moderation; }

    @GetMapping
    public List<Map<String, Object>> queue(@AuthenticationPrincipal VezlistUserPrincipal actor,
            @RequestParam SiteScope site, @RequestParam(defaultValue = "24") @Min(1) @Max(50) int limit,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int offset) {
        return moderation.queue(actor.id(), site, limit, offset);
    }
    @GetMapping("/{id}")
    public Map<String, Object> detail(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id) {
        return moderation.detail(actor.id(), id);
    }
    @PostMapping("/{id}/assignment")
    public Receipt assign(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
                           @Valid @RequestBody Assignment request) { return moderation.assign(actor.id(), id, request); }
    @PostMapping("/{id}/notes")
    public Receipt note(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
                         @Valid @RequestBody Note request) { return moderation.note(actor.id(), id, request); }
    @PostMapping("/{id}/media-reviews")
    public Receipt media(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
                          @Valid @RequestBody MediaReview request) { return moderation.reviewMedia(actor.id(), id, request); }
    @PostMapping("/{id}/decisions")
    public DecisionResult decide(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
                                   @Valid @RequestBody DecisionRequest request) { return moderation.decide(actor.id(), id, request); }
}
