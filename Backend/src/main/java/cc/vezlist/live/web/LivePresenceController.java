package cc.vezlist.live.web;

import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.live.application.LivePresenceService;
import cc.vezlist.live.application.LivePresenceService.Directory;
import cc.vezlist.live.application.LivePresenceService.LiveCreator;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// Legacy presence-only controller, intentionally not registered now that real sessions exist.
@RequestMapping("/api/v1/live")
public class LivePresenceController {
    public record StartRequest(@NotNull UUID listingId, @NotBlank @Size(max = 80) String title) {}

    private final LivePresenceService presence;

    public LivePresenceController(LivePresenceService presence) {
        this.presence = presence;
    }

    @GetMapping
    public Directory list(@RequestParam(defaultValue = "30") int limit) {
        return presence.list(limit);
    }

    @PostMapping("/me")
    @ResponseStatus(HttpStatus.CREATED)
    public LiveCreator start(@AuthenticationPrincipal VezlistUserPrincipal actor,
                             @Valid @RequestBody StartRequest request) {
        return presence.start(actor.id(), request.listingId(), request.title());
    }

    @PostMapping("/me/heartbeat")
    public LiveCreator heartbeat(@AuthenticationPrincipal VezlistUserPrincipal actor) {
        return presence.heartbeat(actor.id());
    }

    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void stop(@AuthenticationPrincipal VezlistUserPrincipal actor) {
        presence.stop(actor.id());
    }
}
