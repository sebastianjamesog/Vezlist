package cc.vezlist.users.web;

import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.users.application.AdminUserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin console: users administration.
 *
 * <p>GET endpoints are available to MODERATOR and ADMIN (read-only staff
 * access); suspend/reinstate are destructive account actions and are
 * restricted to ADMIN, matching the convention {@code StaffModerationController}
 * follows for its own decisions.</p>
 */
@Validated
@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
public class AdminUserController {
    private final AdminUserService service;

    public AdminUserController(AdminUserService service) {
        this.service = service;
    }

    @GetMapping
    public AdminUserPageResponse list(
            @RequestParam(required = false) @Size(max = 200) String query,
            @RequestParam(required = false) @Size(max = 512) String cursor,
            @RequestParam(required = false) @Min(1) @Max(100) Integer limit) {
        return service.list(query, cursor, limit);
    }

    @GetMapping("/{id}")
    public AdminUserDetailResponse detail(@PathVariable UUID id) {
        return service.detail(id);
    }

    @PostMapping("/{id}/suspend")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminUserDetailResponse suspend(
            @AuthenticationPrincipal VezlistUserPrincipal actor,
            @PathVariable UUID id,
            @Valid @RequestBody SuspendUserRequest request) {
        return service.suspend(actor.id(), id, request);
    }

    @PostMapping("/{id}/reinstate")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminUserDetailResponse reinstate(
            @AuthenticationPrincipal VezlistUserPrincipal actor,
            @PathVariable UUID id) {
        return service.reinstate(actor.id(), id);
    }
}
