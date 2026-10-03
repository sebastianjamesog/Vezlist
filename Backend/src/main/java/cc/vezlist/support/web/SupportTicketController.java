package cc.vezlist.support.web;

import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.support.application.SupportTicketService;
import cc.vezlist.support.application.SupportTicketService.Page;
import cc.vezlist.support.application.SupportTicketService.Ticket;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/tickets")
public class SupportTicketController {
    private final SupportTicketService tickets;

    public SupportTicketController(SupportTicketService tickets) {
        this.tickets = tickets;
    }

    @GetMapping
    public Page list(@AuthenticationPrincipal VezlistUserPrincipal actor, @RequestParam SiteScope site,
                     @RequestParam(required = false) String status,
                     @RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit,
                     @RequestParam(defaultValue = "0") @Min(0) int offset) {
        return tickets.list(actor.id(), site, status, limit, offset, false);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Ticket create(@AuthenticationPrincipal VezlistUserPrincipal actor,
                         @Valid @RequestBody SupportTicketRequests.Create request) {
        return tickets.create(actor.id(), request);
    }

    @GetMapping("/{id}")
    public Ticket detail(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id) {
        return tickets.detail(id, actor.id(), false);
    }

    @PostMapping("/{id}/messages")
    public Ticket reply(@AuthenticationPrincipal VezlistUserPrincipal actor, @PathVariable UUID id,
                        @Valid @RequestBody SupportTicketRequests.Reply request) {
        return tickets.reply(id, actor.id(), request.body(), false);
    }
}
