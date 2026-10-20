package cc.vezlist.admin.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cc.vezlist.admin.persistence.AdminAuditLogRepository;
import cc.vezlist.admin.persistence.AdminAuditLogRepository.Entry;
import cc.vezlist.admin.persistence.AdminModerationAuditRepository;
import cc.vezlist.admin.persistence.SecurityEventRepository;
import cc.vezlist.admin.web.AdminAuditEntryResponse;
import cc.vezlist.admin.web.AdminAuditPageResponse;
import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.shared.paging.OpaqueCursor;

/**
 * Public API other modules use to record an admin action into the
 * append-only {@code admin_audit_log} sink, and the query side backing the
 * flattened {@code GET /api/v1/admin/audit} feed. This is the "explicit
 * interface" users/listings/catalog admin services call into rather than
 * writing to the table themselves, matching how e.g. {@code ListingEventPublisher}
 * is the explicit interface other modules use to publish listing events.
 */
@Service
public class AdminAuditService {
    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 100;

    private final AdminAuditLogRepository auditLog;
    private final AdminModerationAuditRepository moderationAudit;
    private final SecurityEventRepository securityEvents;

    public AdminAuditService(
            AdminAuditLogRepository auditLog,
            AdminModerationAuditRepository moderationAudit,
            SecurityEventRepository securityEvents) {
        this.auditLog = auditLog;
        this.moderationAudit = moderationAudit;
        this.securityEvents = securityEvents;
    }

    @Transactional
    public void record(UUID actorId, String action, String targetType, String targetId, String details) {
        auditLog.record(actorId, action, targetType, targetId, details);
    }

    @Transactional(readOnly = true)
    public AdminAuditPageResponse feed(SiteScope site, String encodedCursor, Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("Limit must be between 1 and " + MAX_LIMIT + ".");
        }
        OpaqueCursor.Anchor cursor = OpaqueCursor.decode(encodedCursor);
        Instant before = cursor == null ? null : cursor.createdAt();

        List<Entry> generalEntries = auditLog.page(before, cursor == null ? null : cursor.id(), limit + 1);
        List<Entry> moderationEntries = moderationAudit.page(site, before, cursor == null ? null : cursor.id(), limit + 1);
        // Security events (login/logout/register/password-change) aren't
        // site-scoped -- one account serves both boards -- so they're
        // included regardless of the site filter, same as generalEntries.
        List<Entry> securityEntries = securityEvents.page(before, cursor == null ? null : cursor.id(), limit + 1);

        List<Entry> merged = new ArrayList<>(generalEntries.size() + moderationEntries.size() + securityEntries.size());
        merged.addAll(generalEntries);
        merged.addAll(moderationEntries);
        merged.addAll(securityEntries);
        merged.sort(Comparator.comparing(Entry::createdAt).reversed()
                .thenComparing(entry -> entry.id().toString(), Comparator.reverseOrder()));

        boolean hasMore = merged.size() > limit;
        List<Entry> page = hasMore ? merged.subList(0, limit) : merged;
        String nextCursor = hasMore
                ? OpaqueCursor.encode(new OpaqueCursor.Anchor(
                        page.get(page.size() - 1).createdAt(), page.get(page.size() - 1).id()))
                : null;

        return new AdminAuditPageResponse(page.stream().map(this::response).toList(), nextCursor, hasMore);
    }

    private AdminAuditEntryResponse response(Entry entry) {
        return new AdminAuditEntryResponse(
                entry.id(), entry.actorId(), entry.actorName(), entry.action(),
                entry.targetType(), entry.targetId(), entry.details(), entry.createdAt(),
                entry.ipAddress(), entry.userAgent());
    }
}
