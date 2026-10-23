package cc.vezlist.catalog.web;

import java.util.List;
import java.util.UUID;
import cc.vezlist.catalog.application.EthnicityCatalogService;
import cc.vezlist.catalog.application.EthnicityCatalogService.Option;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/ethnicities")
@PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
public class AdminEthnicityController {
    public record Create(@NotBlank @Size(max=160) String label) {}
    private final EthnicityCatalogService ethnicities;
    public AdminEthnicityController(EthnicityCatalogService ethnicities) { this.ethnicities = ethnicities; }
    @GetMapping
    public ResponseEntity<List<Option>> active() {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(ethnicities.active());
    }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public Option create(@AuthenticationPrincipal VezlistUserPrincipal actor, @Valid @RequestBody Create request) {
        return ethnicities.add(actor.id(), request.label());
    }
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void remove(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id) {
        ethnicities.retire(actor.id(), id);
    }
}
