package cc.vezlist.admin.web;

import java.util.Map;
import cc.vezlist.admin.application.AdminSettingsService;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class AdminSettingsController {
    private final AdminSettingsService service;
    public AdminSettingsController(AdminSettingsService service) { this.service = service; }
    @GetMapping("/api/v1/admin/settings")
    @PreAuthorize("hasAnyRole('ADMIN', 'MODERATOR')")
    public AdminSettingsResponse get() { return service.get(); }
    @PutMapping("/api/v1/admin/settings")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminSettingsResponse update(@AuthenticationPrincipal VezlistUserPrincipal actor,
            @Valid @RequestBody AdminSettingsRequest request) { return service.update(actor.id(), request); }
    @GetMapping("/api/v1/public/settings")
    public Map<String, String> publicSettings() {
        var settings = service.get();
        return Map.of("ageGateTitle", settings.ageGateTitle(), "ageGateBody", settings.ageGateBody());
    }
}
