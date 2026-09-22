package cc.vezlist.listings.web;

import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.listings.application.AdminListingService;
import cc.vezlist.shared.domain.SiteScope;
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
 * Admin console: listings administration — an admin-scoped browse across
 * every listing regardless of owner, distinct from the owner-scoped
 * {@code GET /me/listings} in {@code ListingController}.
 */
@Validated
@RestController
@RequestMapping("/api/v1/admin/listings")
@PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
public class AdminListingController {
    private final AdminListingService service;

    public AdminListingController(AdminListingService service) {
        this.service = service;
    }

    @GetMapping
    public AdminListingPageResponse list(
            @RequestParam(required = false) SiteScope site,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @Size(max = 200) String query,
            @RequestParam(required = false) @Size(max = 512) String cursor,
            @RequestParam(required = false) @Min(1) @Max(100) Integer limit) {
        return service.list(site, status, query, cursor, limit);
    }

    @GetMapping("/{id}")
    public AdminListingDetailResponse detail(@PathVariable UUID id) {
        return service.detail(id);
    }

    @PostMapping("/{id}/remove")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminListingDetailResponse remove(
            @AuthenticationPrincipal VezlistUserPrincipal actor,
            @PathVariable UUID id,
            @Valid @RequestBody RemoveListingRequest request) {
        return service.remove(actor.id(), id, request);
    }
}
