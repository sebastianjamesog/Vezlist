package cc.vezlist.admin.web;

import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET /api/v1/admin/audit?site=&cursor=&limit=
 *
 * Flattens moderation decisions (moderation_actions) and other admin actions
 * (admin_audit_log: user suspend/reinstate, taxonomy CRUD, listing takedown)
 * into one chronological feed. {@code site} is optional: when present it
 * also filters the moderation half of the feed to that site (moderation
 * actions are inherently listing/site scoped); user-management actions are
 * global and are always included since accounts are not tied to one site.
 */
@Validated
@RestController
@RequestMapping("/api/v1/admin/audit")
@PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
public class AdminAuditController {
    private final AdminAuditService audit;

    public AdminAuditController(AdminAuditService audit) {
        this.audit = audit;
    }

    @GetMapping
    public AdminAuditPageResponse feed(
            @RequestParam(required = false) SiteScope site,
            @RequestParam(required = false) @Size(max = 512) String cursor,
            @RequestParam(required = false) @Min(1) @Max(100) Integer limit) {
        return audit.feed(site, cursor, limit);
    }
}
