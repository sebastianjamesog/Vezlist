package cc.vezlist.support.application;

import java.util.UUID;
import cc.vezlist.shared.domain.SiteScope;

/** Invalidation only: no conversation text, credentials or user details. */
public record SupportTicketChanged(UUID ticketId, UUID ownerId, SiteScope site,
                                   UUID readerId, Boolean readerStaff) {
    public static SupportTicketChanged conversation(SupportTicketService.Ticket ticket) {
        return new SupportTicketChanged(ticket.id(), ticket.ownerId(), ticket.site(), null, null);
    }
}
