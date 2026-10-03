package cc.vezlist.stories.web;

import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.stories.application.StoryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/stories")
public class StoryController {
    private final StoryService stories;
    public StoryController(StoryService stories) { this.stories = stories; }
    public record UploadRequest(@NotBlank @Size(max=255) String filename, @NotBlank String contentType,
                                @Positive long sizeBytes, @NotNull @Pattern(regexp="[a-fA-F0-9]{64}") String checksumSha256) {}
    public record PublishRequest(UUID planId, Long planVersion, boolean useCredit, boolean demoPurchase) {}

    @GetMapping("/plans") public StoryService.Plans plans() { return stories.plans(false, null); }
    @GetMapping public StoryService.Stories list(@RequestParam(defaultValue="100") int limit) { return stories.list(limit, null); }
    @GetMapping("/creator/{ownerId}") public StoryService.Stories creator(@PathVariable UUID ownerId) { return stories.list(100, ownerId); }
    @GetMapping("/me") public StoryService.MyStories mine(@AuthenticationPrincipal VezlistUserPrincipal actor) { return stories.mine(actor.id()); }
    @PostMapping("/uploads") @ResponseStatus(HttpStatus.CREATED)
    public StoryService.Upload upload(@AuthenticationPrincipal VezlistUserPrincipal actor, @Valid @RequestBody UploadRequest body) {
        return stories.upload(actor.id(), body.filename(), body.contentType(), body.sizeBytes(), body.checksumSha256());
    }
    @PostMapping("/{id}/complete") public StoryService.Story complete(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id) {
        return stories.complete(actor.id(), id);
    }
    @PostMapping("/{id}/publish") public StoryService.Story publish(@AuthenticationPrincipal VezlistUserPrincipal actor,
            @PathVariable UUID id, @Valid @RequestBody PublishRequest body) {
        return stories.publish(actor.id(), id, body.planId(), body.planVersion(), body.useCredit(), body.demoPurchase());
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id) { stories.delete(actor.id(), id); }
}
