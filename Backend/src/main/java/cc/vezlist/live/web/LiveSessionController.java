package cc.vezlist.live.web;
import java.util.List;
import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.live.application.LiveSessionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/live")
public class LiveSessionController {
    private final LiveSessionService live;
    public LiveSessionController(LiveSessionService live){this.live=live;}
    public record Start(UUID listingId,@NotBlank @Size(max=80) String title,@NotNull UUID planId,@PositiveOrZero long planVersion,boolean demoPurchase){}
    public record Payments(@NotNull @Size(max=3) List<LiveSessionService.PaymentDetail> items){}
    @GetMapping("/plans") public LiveSessionService.Plans plans(){return live.plans(false,null);}
    @GetMapping public LiveSessionService.Directory list(@RequestParam(defaultValue="30") int limit){return live.directory(limit,false,null);}
    @GetMapping("/me") public LiveSessionService.Mine mine(@AuthenticationPrincipal VezlistUserPrincipal actor){return live.mine(actor.id());}
    @GetMapping("/payment-details") public LiveSessionService.PaymentDetails payments(@AuthenticationPrincipal VezlistUserPrincipal actor){return live.paymentDetails(actor.id());}
    @PutMapping("/payment-details") public LiveSessionService.PaymentDetails payments(@AuthenticationPrincipal VezlistUserPrincipal actor,@Valid @RequestBody Payments body){return live.savePayments(actor.id(),body.items());}
    @PostMapping("/sessions") @ResponseStatus(HttpStatus.CREATED)
    public LiveSessionService.SessionDTO create(@AuthenticationPrincipal VezlistUserPrincipal actor,@Valid @RequestBody Start body,
            @RequestHeader(value="Idempotency-Key",required=false) UUID key){return live.create(actor.id(),body.listingId(),body.title(),body.planId(),body.planVersion(),body.demoPurchase(),key);}
    @GetMapping("/sessions/{id}") public LiveSessionService.SessionDTO session(@PathVariable UUID id){return live.publicSession(id);}
    @PostMapping("/sessions/{id}/end") public LiveSessionService.SessionDTO end(@AuthenticationPrincipal VezlistUserPrincipal actor,@PathVariable UUID id){return live.end(actor.id(),id,false);}
    @PostMapping("/sessions/{id}/broadcast-ticket") public LiveSessionService.BroadcastTicket ticket(@AuthenticationPrincipal VezlistUserPrincipal actor,@PathVariable UUID id){return live.ticket(actor.id(),id);}
}
