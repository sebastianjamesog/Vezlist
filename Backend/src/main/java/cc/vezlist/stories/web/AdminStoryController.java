package cc.vezlist.stories.web;

import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.stories.application.AdminStoryService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequestMapping("/api/v1/admin/stories")
@PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
public class AdminStoryController {
    private final AdminStoryService stories;
    public AdminStoryController(AdminStoryService stories) { this.stories = stories; }
    @GetMapping
    public AdminStoryService.Page list(@AuthenticationPrincipal VezlistUserPrincipal actor,
            @RequestParam(required=false) @Size(max=500) String cursor,
            @RequestParam(defaultValue="50") @Min(1) @Max(100) int limit) {
        return stories.list(actor.id(), cursor, limit);
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id) { stories.remove(actor.id(), id); }
    @DeleteMapping("/creator/{ownerId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeCreator(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID ownerId) { stories.removeCreator(actor.id(), ownerId); }
}
