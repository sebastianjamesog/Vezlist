package cc.vezlist.moderation.web;

import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.moderation.application.ModerationService;
import cc.vezlist.moderation.application.ModerationService.*;
import cc.vezlist.moderation.web.ModerationRequests.*;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ModerationController {
    private final ModerationService moderation;
    public ModerationController(ModerationService moderation) { this.moderation = moderation; }

    @PostMapping("/listings/{id}/reports")
    public Receipt report(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
                          @Valid @RequestBody Report request) {
        return moderation.report(actor.id(), id, request);
    }
    @GetMapping("/me/listings/{id}/moderation")
    public OwnerStatus status(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
                              @RequestParam SiteScope site) {
        return moderation.ownerStatus(actor.id(), id, site);
    }
    @PostMapping("/me/listings/{id}/moderation/appeals")
    public Receipt appeal(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
                           @Valid @RequestBody Appeal request) {
        return moderation.appeal(actor.id(), id, request);
    }
}
