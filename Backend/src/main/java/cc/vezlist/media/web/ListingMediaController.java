package cc.vezlist.media.web;

import java.util.List;
import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.media.application.ListingMediaService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/listings/{listingId}/media")
public class ListingMediaController {
    private final ListingMediaService media;

    public ListingMediaController(ListingMediaService media) {
        this.media = media;
    }

    @PostMapping("/upload-url")
    MediaUploadAuthorizationResponse authorizeUpload(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @Valid @RequestBody MediaUploadRequest request) {
        return media.authorizeUpload(principal.id(), listingId, request);
    }

    @PostMapping("/{mediaId}/complete")
    ListingMediaResponse complete(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @PathVariable UUID mediaId) {
        return media.complete(principal.id(), listingId, mediaId);
    }

    @PatchMapping("/order")
    List<ListingMediaResponse> reorder(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @Valid @RequestBody MediaOrderRequest request) {
        return media.reorder(principal.id(), listingId, request);
    }

    @DeleteMapping("/{mediaId}")
    ResponseEntity<Void> delete(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @PathVariable UUID listingId,
            @PathVariable UUID mediaId) {
        media.delete(principal.id(), listingId, mediaId);
        return ResponseEntity.noContent().build();
    }
}
