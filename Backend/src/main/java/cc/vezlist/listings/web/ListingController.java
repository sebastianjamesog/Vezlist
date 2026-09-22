package cc.vezlist.listings.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.listings.application.ListingService;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1")
public class ListingController {
    private final ListingService listingService;

    public ListingController(ListingService listingService) {
        this.listingService = listingService;
    }

    @PostMapping("/listings")
    ResponseEntity<ListingResponse> create(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @RequestHeader("Idempotency-Key") @NotBlank @Size(max = 160) String idempotencyKey,
            @Valid @RequestBody ListingWriteRequest request) {
        ListingResponse listing = listingService.create(principal.id(), idempotencyKey, request);
        return ResponseEntity.created(URI.create("/api/v1/listings/" + listing.id())).body(listing);
    }

    @PatchMapping("/listings/{listingId}")
    ListingResponse update(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @Valid @RequestBody ListingWriteRequest request) {
        return listingService.update(principal.id(), listingId, request);
    }

    @PostMapping("/listings/{listingId}/submit")
    ListingResponse submit(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @RequestHeader("Idempotency-Key") @NotBlank @Size(max = 160) String idempotencyKey,
            @RequestBody(required = false) ListingSubmitRequest request) {
        return listingService.submit(principal.id(), listingId, idempotencyKey,
                request != null && request.requestVerification());
    }

    @GetMapping("/listings/{listingId}")
    ListingResponse detail(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @RequestParam SiteScope site) {
        return listingService.detail(listingId, site, principal == null ? null : principal.id());
    }

    @GetMapping("/me/listings")
    List<ListingResponse> owned(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @RequestParam SiteScope site) {
        return listingService.owned(principal.id(), site);
    }

    @GetMapping("/me/listings/summary")
    OwnedListingSummaryResponse summary(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @RequestParam SiteScope site) {
        return new OwnedListingSummaryResponse(listingService.activeOwnedCount(principal.id(), site));
    }

    @DeleteMapping("/listings/{listingId}")
    ResponseEntity<Void> delete(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId) {
        listingService.delete(principal.id(), listingId);
        return ResponseEntity.noContent().build();
    }
}
