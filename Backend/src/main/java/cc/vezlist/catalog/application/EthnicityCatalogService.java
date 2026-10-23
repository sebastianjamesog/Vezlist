package cc.vezlist.catalog.application;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EthnicityCatalogService {
    public record Option(UUID id, String label) {}
    private final JdbcTemplate jdbc;
    private final AdminAuditService audit;
    public EthnicityCatalogService(JdbcTemplate jdbc, AdminAuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<Option> active() {
        return jdbc.query("SELECT id,label FROM ethnicities WHERE enabled ORDER BY display_order,id",
                (rs, row) -> new Option(rs.getObject("id", UUID.class), rs.getString("label")));
    }

    @Transactional
    public Option add(UUID actorId, String rawLabel) {
        String label = rawLabel == null ? "" : rawLabel.strip();
        if (label.isEmpty() || label.length() > 80) throw new IllegalArgumentException("Ethnicity must be between 1 and 80 characters.");
        // Atomic unique-index arbitration also handles concurrent adds and restores.
        List<Option> result = jdbc.query("""
                INSERT INTO ethnicities(label) VALUES (?)
                ON CONFLICT (lower(label)) DO UPDATE SET enabled=TRUE WHERE ethnicities.enabled=FALSE
                RETURNING id,label
                """, (rs, row) -> new Option(rs.getObject("id", UUID.class), rs.getString("label")), label);
        if (result.isEmpty()) throw new CatalogAlreadyExistsException("This ethnicity already exists.");
        Option option = result.getFirst();
        audit.record(actorId, "ETHNICITY_ADDED", "ETHNICITY", option.id().toString(), option.label());
        return option;
    }

    @Transactional
    public void retire(UUID actorId, UUID id) {
        List<String> labels = jdbc.query("UPDATE ethnicities SET enabled=FALSE WHERE id=? AND enabled RETURNING label",
                (rs, row) -> rs.getString("label"), id);
        if (labels.isEmpty()) throw new CatalogNotFoundException("Ethnicity was not found.");
        audit.record(actorId, "ETHNICITY_REMOVED", "ETHNICITY", id.toString(), labels.getFirst());
    }

    /** Historical/retired values remain editable unchanged, never reusable on another ad. */
    public Map<String, String> listingAttributes(SiteScope site, Map<String, String> requested, String existing) {
        if (site != SiteScope.PERSONALS) return requested;
        String value = requested.get("ethnicity");
        if (Objects.equals(value, existing)) return requested;
        var attributes = new LinkedHashMap<>(requested);
        if (value == null || value.isBlank()) {
            attributes.remove("ethnicity");
            return attributes;
        }
        String label = value.strip();
        if (label.length() > 80) throw new CatalogReferenceInvalidException("Choose an available ethnicity.");
        // Listing writes already run in a transaction. The shared row lock prevents
        // retirement committing halfway through validation and publication of a draft.
        List<String> current = jdbc.query("SELECT label FROM ethnicities WHERE enabled AND lower(label)=lower(?) FOR SHARE",
                (rs, row) -> rs.getString("label"), label);
        if (current.isEmpty()) throw new CatalogReferenceInvalidException("Choose an available ethnicity.");
        attributes.put("ethnicity", current.getFirst());
        return attributes;
    }
}
