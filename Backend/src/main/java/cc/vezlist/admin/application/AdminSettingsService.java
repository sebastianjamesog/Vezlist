package cc.vezlist.admin.application;

import java.util.UUID;
import cc.vezlist.admin.web.AdminSettingsRequest;
import cc.vezlist.admin.web.AdminSettingsResponse;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminSettingsService {
    private final JdbcTemplate jdbc;
    private final AdminAuditService audit;
    public AdminSettingsService(JdbcTemplate jdbc, AdminAuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }
    @Transactional(readOnly = true)
    public AdminSettingsResponse get() {
        return jdbc.queryForObject("SELECT * FROM platform_settings WHERE id = 1", (rs, n) ->
                new AdminSettingsResponse(rs.getString("age_gate_title"), rs.getString("age_gate_body"),
                        rs.getInt("review_sla_hours"), rs.getInt("report_sla_hours"),
                        rs.getInt("ticket_sla_hours"), rs.getLong("version")));
    }
    @Transactional
    public AdminSettingsResponse update(UUID actor, AdminSettingsRequest request) {
        int changed = jdbc.update("""
                UPDATE platform_settings SET age_gate_title = ?, age_gate_body = ?,
                  review_sla_hours = ?, report_sla_hours = ?, ticket_sla_hours = ?, version = version + 1
                WHERE id = 1 AND version = ?
                """, request.ageGateTitle().trim(), request.ageGateBody().trim(), request.reviewSlaHours(),
                request.reportSlaHours(), request.ticketSlaHours(), request.version());
        if (changed == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Settings changed. Reload before saving.");
        audit.record(actor, "SETTINGS_UPDATED", "SETTINGS", "platform", "Updated public age gate and queue response targets");
        return get();
    }
}
