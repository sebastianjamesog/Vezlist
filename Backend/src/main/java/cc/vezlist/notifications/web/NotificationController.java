package cc.vezlist.notifications.web;

import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.notifications.application.NotificationService;
import cc.vezlist.notifications.application.NotificationService.*;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/api/v1/me/notifications", "/api/v1/admin/me/notifications"})
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service = service; }

    @GetMapping
    public Page list(@AuthenticationPrincipal VezlistUserPrincipal actor, @RequestParam SiteScope site,
                     @RequestParam(defaultValue = "24") int limit, @RequestParam(required = false) String cursor) {
        return service.list(actor.id(), site, limit, cursor);
    }
    @GetMapping("/unread-count")
    public Count unread(@AuthenticationPrincipal VezlistUserPrincipal actor, @RequestParam SiteScope site) {
        return service.unread(actor.id(), site);
    }
    @PostMapping("/{id}/read")
    public Count read(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id, @RequestParam SiteScope site) {
        return service.markRead(actor.id(), site, id);
    }
    @PostMapping("/read-all")
    public Count readAll(@AuthenticationPrincipal VezlistUserPrincipal actor, @RequestParam SiteScope site) {
        return service.markAllRead(actor.id(), site);
    }
}
