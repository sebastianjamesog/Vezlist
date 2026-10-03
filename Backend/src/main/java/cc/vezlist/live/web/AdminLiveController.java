package cc.vezlist.live.web;
import java.math.BigDecimal;
import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.live.application.LiveSessionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/admin")
public class AdminLiveController {
    private final LiveSessionService live;
    public AdminLiveController(LiveSessionService live){this.live=live;}
    public record PlanBody(@NotBlank @Size(max=80) String name,@Min(1) @Max(180) int durationMinutes,
            @NotNull @DecimalMin("0.00") @DecimalMax("99999999.99") @Digits(integer=8,fraction=2) BigDecimal price,
            @NotNull @Pattern(regexp="CAD|USD|EUR|GBP") String currency,@Size(max=40) String badge,
            boolean enabled,@Min(0) @Max(10000) int sortOrder,@PositiveOrZero Long version){}
    @GetMapping("/live-plans") @PreAuthorize("hasRole('ADMIN')") public LiveSessionService.Plans plans(@AuthenticationPrincipal VezlistUserPrincipal actor){return live.plans(true,actor.id());}
    @PostMapping("/live-plans") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMIN')")
    public LiveSessionService.Plan create(@AuthenticationPrincipal VezlistUserPrincipal actor,@Valid @RequestBody PlanBody body){return save(actor,null,body);}
    @PutMapping("/live-plans/{id}") @PreAuthorize("hasRole('ADMIN')") public LiveSessionService.Plan update(@AuthenticationPrincipal VezlistUserPrincipal actor,@PathVariable UUID id,@Valid @RequestBody PlanBody body){return save(actor,id,body);}
    private LiveSessionService.Plan save(VezlistUserPrincipal actor,UUID id,PlanBody body){return live.savePlan(actor.id(),id,body.name(),body.durationMinutes(),body.price(),body.currency(),body.badge(),body.enabled(),body.sortOrder(),body.version());}
    @GetMapping("/live") @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')") public LiveSessionService.Directory directory(@AuthenticationPrincipal VezlistUserPrincipal actor,@RequestParam(defaultValue="50") int limit){return live.directory(limit,true,actor.id());}
    @PostMapping("/live/{id}/end") @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')") public LiveSessionService.SessionDTO end(@AuthenticationPrincipal VezlistUserPrincipal actor,@PathVariable UUID id){return live.end(actor.id(),id,true);}
}
