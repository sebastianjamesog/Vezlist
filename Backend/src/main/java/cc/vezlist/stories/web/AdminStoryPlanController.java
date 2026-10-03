package cc.vezlist.stories.web;

import java.math.BigDecimal;
import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.stories.application.StoryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/story-plans")
@PreAuthorize("hasRole('ADMIN')")
public class AdminStoryPlanController {
    private final StoryService stories;
    public AdminStoryPlanController(StoryService stories) { this.stories = stories; }
    public record PlanRequest(@NotBlank @Size(max=80) String name,
            @NotNull @DecimalMin("0.00") @DecimalMax("99999999.99") @Digits(integer=8,fraction=2) BigDecimal price,
            @NotNull @Pattern(regexp="CAD|USD|EUR|GBP") String currency,
            @Min(1) @Max(100) int storyCount, boolean enabled, @Min(0) @Max(10000) int sortOrder, @PositiveOrZero Long version) {}
    @GetMapping public StoryService.Plans list(@AuthenticationPrincipal VezlistUserPrincipal actor) { return stories.plans(true, actor.id()); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public StoryService.Plan create(@AuthenticationPrincipal VezlistUserPrincipal actor, @Valid @RequestBody PlanRequest body) {
        return save(actor, null, body);
    }
    @PutMapping("/{id}") public StoryService.Plan update(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
            @Valid @RequestBody PlanRequest body) { return save(actor, id, body); }
    private StoryService.Plan save(VezlistUserPrincipal actor, UUID id, PlanRequest body) {
        return stories.savePlan(actor.id(), id, body.name(), body.price(), body.currency(), body.storyCount(), body.enabled(), body.sortOrder(), body.version());
    }
}
