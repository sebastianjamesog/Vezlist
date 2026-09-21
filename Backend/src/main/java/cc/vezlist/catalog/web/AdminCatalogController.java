package cc.vezlist.catalog.web;

import java.util.List;

import cc.vezlist.catalog.application.AdminCatalogService;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin console: taxonomy administration (categories + locations). Reads
 * are MODERATOR/ADMIN; create/update/delete are ADMIN-only, matching the
 * convention for destructive admin actions elsewhere in this module.
 */
@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
public class AdminCatalogController {
    private final AdminCatalogService service;

    public AdminCatalogController(AdminCatalogService service) {
        this.service = service;
    }

    @GetMapping("/categories")
    public List<AdminCategoryResponse> categories(@RequestParam(required = false) SiteScope site) {
        return service.listCategories(site);
    }

    @PostMapping("/categories")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminCategoryResponse createCategory(
            @AuthenticationPrincipal VezlistUserPrincipal actor, @Valid @RequestBody CreateCategoryRequest request) {
        return service.createCategory(actor.id(), request);
    }

    @PatchMapping("/categories/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminCategoryResponse updateCategory(
            @AuthenticationPrincipal VezlistUserPrincipal actor,
            @PathVariable String id,
            @Valid @RequestBody UpdateCategoryRequest request) {
        return service.updateCategory(actor.id(), id, request);
    }

    @DeleteMapping("/categories/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCategory(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable String id) {
        service.deleteCategory(actor.id(), id);
    }

    @GetMapping("/locations")
    public List<AdminLocationResponse> locations(@RequestParam(required = false) String provinceId) {
        return service.listLocations(provinceId);
    }

    @PostMapping("/locations/provinces")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminLocationResponse createProvince(
            @AuthenticationPrincipal VezlistUserPrincipal actor, @Valid @RequestBody CreateProvinceRequest request) {
        return service.createProvince(actor.id(), request);
    }

    @PostMapping("/locations/areas")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminLocationResponse createArea(
            @AuthenticationPrincipal VezlistUserPrincipal actor, @Valid @RequestBody CreateAreaRequest request) {
        return service.createArea(actor.id(), request);
    }

    @PatchMapping("/locations/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminLocationResponse updateLocation(
            @AuthenticationPrincipal VezlistUserPrincipal actor,
            @PathVariable String id,
            @Valid @RequestBody UpdateLocationRequest request) {
        return service.updateLocation(actor.id(), id, request);
    }

    @DeleteMapping("/locations/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteArea(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable String id) {
        service.deleteArea(actor.id(), id);
    }
}
