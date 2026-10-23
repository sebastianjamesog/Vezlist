package cc.vezlist.support.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.support.web.SupportTicketRequests;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SupportTicketService {
    public record Message(UUID id, UUID senderId, String senderName, boolean staff, String body, Instant createdAt) {}
    public record Ticket(UUID id, UUID ownerId, String ownerName, SiteScope site, String subject,
                         String status, Instant createdAt, Instant updatedAt, List<Message> messages, long unreadCount) {}
    public record Page(List<Ticket> items, Integer nextOffset, long total) {}

    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    public SupportTicketService(JdbcTemplate jdbc, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.events = events;
    }

    @Transactional
    public Ticket create(UUID ownerId, SupportTicketRequests.Create request) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO support_tickets(id, owner_id, site_scope, subject) VALUES (?, ?, ?, ?)",
                id, ownerId, request.site().name(), request.subject().strip());
        addMessage(id, ownerId, false, request.body());
        Ticket ticket = detail(id, ownerId, false);
        events.publishEvent(SupportTicketChanged.conversation(ticket));
        return ticket;
    }

    @Transactional(readOnly = true)
    public Page list(UUID actorId, SiteScope site, String status, int limit, int offset, boolean staff) {
        if (limit < 1 || limit > 100 || offset < 0 || offset > 100000) {
            throw new IllegalArgumentException("Limit must be 1-100 and offset must be 0-100000.");
        }
        String normalizedStatus = normalizeStatus(status, true);
        String where = " WHERE t.site_scope = ?" + (staff ? "" : " AND t.owner_id = ?")
                + (normalizedStatus == null ? "" : " AND t.status = ?");
        java.util.ArrayList<Object> args = new java.util.ArrayList<>();
        args.add(site.name());
        if (!staff) args.add(actorId);
        if (normalizedStatus != null) args.add(normalizedStatus);
        long total = jdbc.queryForObject("SELECT COUNT(*) FROM support_tickets t" + where, Long.class, args.toArray());
        args.add(limit);
        args.add(offset);
        java.util.ArrayList<Object> selectArgs = new java.util.ArrayList<>(List.of(!staff, actorId, staff));
        selectArgs.addAll(args);
        List<Ticket> items = jdbc.query("SELECT " + unreadSql() + ", t.id, t.owner_id, u.display_name AS owner_name,"
                + " t.site_scope, t.subject, t.status, t.created_at, t.updated_at"
                + " FROM support_tickets t JOIN app_users u ON u.id = t.owner_id" + where
                + " ORDER BY t.updated_at DESC, t.id DESC LIMIT ? OFFSET ?",
                (rs, row) -> mapTicket(rs), selectArgs.toArray());
        Integer next = offset + items.size() < total ? offset + items.size() : null;
        return new Page(items, next, total);
    }

    @Transactional(readOnly = true)
    public Ticket detail(UUID id, UUID actorId, boolean staff) {
        String sql = "SELECT " + unreadSql() + ", t.id, t.owner_id, u.display_name AS owner_name, t.site_scope, t.subject,"
                + " t.status, t.created_at, t.updated_at FROM support_tickets t"
                + " JOIN app_users u ON u.id = t.owner_id WHERE t.id = ?"
                + (staff ? "" : " AND t.owner_id = ?");
        Object[] args = staff ? new Object[] { !staff, actorId, staff, id } : new Object[] { !staff, actorId, staff, id, actorId };
        try {
            Ticket row = jdbc.queryForObject(sql, (rs, n) -> mapTicket(rs), args);
            List<Message> messages = jdbc.query("SELECT m.id, m.sender_id, u.display_name AS sender_name,"
                    + " m.staff, m.body, m.created_at FROM support_messages m"
                    + " JOIN app_users u ON u.id = m.sender_id WHERE m.ticket_id = ?"
                    + " ORDER BY m.message_order", (rs, n) -> new Message(
                            rs.getObject("id", UUID.class), rs.getObject("sender_id", UUID.class),
                            rs.getString("sender_name"), rs.getBoolean("staff"), rs.getString("body"),
                            rs.getTimestamp("created_at").toInstant()), id);
            return new Ticket(row.id(), row.ownerId(), row.ownerName(), row.site(), row.subject(),
                    row.status(), row.createdAt(), row.updatedAt(), messages, row.unreadCount());
        } catch (EmptyResultDataAccessException exception) {
            throw new SupportTicketNotFoundException();
        }
    }

    @Transactional
    public Ticket reply(UUID id, UUID actorId, String body, boolean staff) {
        lockTicket(id, actorId, staff);
        addMessage(id, actorId, staff, body);
        jdbc.update("UPDATE support_tickets SET status = 'OPEN', updated_at = now() WHERE id = ?", id);
        Ticket ticket = detail(id, actorId, staff);
        events.publishEvent(SupportTicketChanged.conversation(ticket));
        return ticket;
    }

    @Transactional
    public Ticket setStatus(UUID id, UUID actorId, String status) {
        lockTicket(id, actorId, true);
        String normalized = normalizeStatus(status, false);
        jdbc.update("UPDATE support_tickets SET status = ?, updated_at = now() WHERE id = ?", normalized, id);
        Ticket ticket = detail(id, actorId, true);
        events.publishEvent(SupportTicketChanged.conversation(ticket));
        return ticket;
    }

    @Transactional
    public Ticket read(UUID id, UUID actorId, UUID messageId, boolean staff) {
        lockTicket(id, actorId, staff);
        Long marker;
        try {
            marker = jdbc.queryForObject("SELECT message_order FROM support_messages WHERE id=? AND ticket_id=?",
                    Long.class, messageId, id);
        } catch (EmptyResultDataAccessException exception) {
            throw new SupportTicketNotFoundException();
        }
        int changed = jdbc.update("""
                INSERT INTO support_ticket_reads(ticket_id,actor_id,staff,last_read_order) VALUES (?,?,?,?)
                ON CONFLICT (ticket_id,actor_id,staff) DO UPDATE SET last_read_order=EXCLUDED.last_read_order
                WHERE support_ticket_reads.last_read_order < EXCLUDED.last_read_order
                """, id, actorId, staff, marker);
        Ticket ticket = detail(id, actorId, staff);
        if (changed > 0) events.publishEvent(new SupportTicketChanged(id, ticket.ownerId(), ticket.site(), actorId, staff));
        return ticket;
    }

    // Serialize writers before assigning message order: a later committed message
    // cannot obtain an earlier marker and disappear behind a read acknowledgement.
    private void lockTicket(UUID id, UUID actorId, boolean staff) {
        try {
            jdbc.queryForObject("SELECT id FROM support_tickets WHERE id=?"
                    + (staff ? "" : " AND owner_id=?") + " FOR UPDATE", UUID.class,
                    staff ? new Object[]{id} : new Object[]{id, actorId});
        } catch (EmptyResultDataAccessException exception) {
            throw new SupportTicketNotFoundException();
        }
    }

    private String unreadSql() {
        return """
                (SELECT count(*) FROM support_messages unread WHERE unread.ticket_id=t.id AND unread.staff=?
                  AND unread.message_order > COALESCE((SELECT last_read_order FROM support_ticket_reads seen
                    WHERE seen.ticket_id=t.id AND seen.actor_id=? AND seen.staff=?),0)) AS unread_count
                """;
    }

    private void addMessage(UUID ticketId, UUID senderId, boolean staff, String body) {
        jdbc.update("INSERT INTO support_messages(id, ticket_id, sender_id, staff, body) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID(), ticketId, senderId, staff, body.strip());
    }

    private String normalizeStatus(String status, boolean optional) {
        if (status == null || status.isBlank()) {
            if (optional) return null;
            throw new IllegalArgumentException("Status is required.");
        }
        String normalized = status.strip().toUpperCase(java.util.Locale.ROOT);
        if (!normalized.equals("OPEN") && !normalized.equals("RESOLVED")) {
            throw new IllegalArgumentException("Status must be OPEN or RESOLVED.");
        }
        return normalized;
    }

    private Ticket mapTicket(ResultSet rs) throws SQLException {
        return new Ticket(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class),
                rs.getString("owner_name"), SiteScope.valueOf(rs.getString("site_scope")),
                rs.getString("subject"), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(), List.of(), rs.getLong("unread_count"));
    }
}
