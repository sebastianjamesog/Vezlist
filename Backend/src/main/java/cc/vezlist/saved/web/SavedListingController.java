package cc.vezlist.saved.web;

import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.saved.application.SavedListingService;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1")
public class SavedListingController {
    private final SavedListingService service;

    public SavedListingController(SavedListingService service) {
        this.service = service;
    }

    @GetMapping("/listings/{listingId}/saved")
    SavedStateResponse state(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @RequestParam SiteScope site) {
        return service.state(principal.id(), listingId, site);
    }

    @PostMapping("/listings/{listingId}/saved")
    SavedStateResponse save(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @RequestParam SiteScope site) {
        return service.save(principal.id(), listingId, site);
    }

    @DeleteMapping("/listings/{listingId}/saved")
    SavedStateResponse unsave(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @RequestParam SiteScope site) {
        return service.unsave(principal.id(), listingId, site);
    }

    @GetMapping("/me/saved-listings")
    SavedListingPageResponse savedListings(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @RequestParam SiteScope site,
            @RequestParam(required = false) @Size(max = 2048) String cursor,
            @RequestParam(required = false) @Min(1) @Max(50) Integer limit) {
        return service.list(principal.id(), site, cursor, limit);
    }
}
