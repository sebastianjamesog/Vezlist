package cc.vezlist.admin.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * End-to-end coverage for the new admin console surface: authorization
 * (USER forbidden, MODERATOR read-only, ADMIN destructive), the users
 * suspend/reinstate lifecycle, admin listing takedown respecting the
 * listing state machine, taxonomy CRUD with the in-use delete guard, and
 * that analytics/audit return real, non-fabricated data.
 */
@Tag("integration")
@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AdminIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("vezlist.seed-admin", () -> false);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @Test void nonStaffIsForbiddenFromEveryAdminEndpoint() throws Exception {
        var user = account(Role.USER);
        mvc.perform(get("/api/v1/admin/users").with(user(user))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/listings").with(user(user))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/categories").with(user(user))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/analytics/summary?site=MARKETPLACE").with(user(user))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/audit").with(user(user))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/users")).andExpect(status().isUnauthorized());
    }

    @Test void moderatorCanReadButNotSuspendOrDeleteCategory() throws Exception {
        var moderator = account(Role.MODERATOR);
        var target = account(Role.USER);
        mvc.perform(get("/api/v1/admin/users").with(user(moderator))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/users/" + target.id()).with(user(moderator))).andExpect(status().isOk());
        postAs(moderator, "/api/v1/admin/users/" + target.id() + "/suspend", Map.of("reason", "Testing"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/admin/categories/services").with(user(moderator)).with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test void adminCanSuspendAndReinstateAUserAndItIsAudited() throws Exception {
        var admin = account(Role.ADMIN);
        var target = account(Role.USER);
        UUID activeListing = listing(target, "MARKETPLACE", "ACTIVE");

        postAs(admin, "/api/v1/admin/users/" + target.id() + "/suspend", Map.of("reason", "Repeated policy violations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.suspensionReason").value("Repeated policy violations"));
        assertThat(jdbc.queryForObject("SELECT enabled FROM app_users WHERE id = ?", Boolean.class, target.id())).isFalse();
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM admin_audit_log WHERE target_id = ? AND action = 'USER_SUSPENDED'",
                Long.class, target.id().toString())).isEqualTo(1L);

        postAs(admin, "/api/v1/admin/users/" + target.id() + "/reinstate", Map.of())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));
        assertThat(jdbc.queryForObject("SELECT enabled FROM app_users WHERE id = ?", Boolean.class, target.id())).isTrue();

        // Admin cannot suspend themselves.
        postAs(admin, "/api/v1/admin/users/" + admin.id() + "/suspend", Map.of("reason", "n/a"))
                .andExpect(status().isConflict());

        mvc.perform(get("/api/v1/admin/audit?site=MARKETPLACE").with(user(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
        assertThat(activeListing).isNotNull();
    }

    @Test void adminCanForceRemoveOnlyAnActiveListing() throws Exception {
        var admin = account(Role.ADMIN);
        var owner = account(Role.USER);
        UUID draft = listing(owner, "MARKETPLACE", "DRAFT");
        UUID active = listing(owner, "MARKETPLACE", "ACTIVE");

        postAs(admin, "/api/v1/admin/listings/" + draft + "/remove", Map.of("reason", "Prohibited item"))
                .andExpect(status().isConflict());

        postAs(admin, "/api/v1/admin/listings/" + active + "/remove", Map.of("reason", "Prohibited item"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listing.status").value("REMOVED"));
        assertThat(jdbc.queryForObject("SELECT status FROM listings WHERE id = ?", String.class, active)).isEqualTo("REMOVED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ? AND event_type = 'LISTING_REMOVED'",
                Long.class, active)).isEqualTo(1L);

        // Cannot remove twice - no longer ACTIVE.
        postAs(admin, "/api/v1/admin/listings/" + active + "/remove", Map.of("reason", "Prohibited item"))
                .andExpect(status().isConflict());

        mvc.perform(get("/api/v1/admin/listings?site=MARKETPLACE&status=REMOVED").with(user(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(active.toString()));
    }

    @Test void categoryCrudEnforcesInUseDeleteGuard() throws Exception {
        var admin = account(Role.ADMIN);
        var owner = account(Role.USER);

        String created = json.readTree(postAs(admin, "/api/v1/admin/categories",
                        Map.of("label", "Musical Instruments", "icon", "Music", "site", "MARKETPLACE",
                                "primary", false, "displayOrder", 99))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        assertThat(created).isEqualTo("musical-instruments");

        patchAs(admin, "/api/v1/admin/categories/" + created,
                Map.of("label", "Musical Instruments", "icon", "Music", "primary", true, "displayOrder", 5, "enabled", true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.primary").value(true));

        listing(owner, "MARKETPLACE", "ACTIVE", created);
        mvc.perform(delete("/api/v1/admin/categories/" + created).with(user(admin)).with(csrf()))
                .andExpect(status().isConflict());

        jdbc.update("DELETE FROM listing_attributes WHERE listing_id IN (SELECT id FROM listings WHERE category_id = ?)", created);
        jdbc.update("DELETE FROM listings WHERE category_id = ?", created);
        mvc.perform(delete("/api/v1/admin/categories/" + created).with(user(admin)).with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM admin_audit_log WHERE target_id = ? AND action = 'CATEGORY_DELETED'",
                Long.class, created)).isEqualTo(1L);
    }

    @Test void analyticsSummaryReturnsRealCounts() throws Exception {
        var admin = account(Role.ADMIN);
        var owner = account(Role.USER);
        listing(owner, "MARKETPLACE", "ACTIVE");
        listing(owner, "MARKETPLACE", "PENDING_REVIEW");

        long totalUsersBefore = jdbc.queryForObject("SELECT count(*) FROM app_users", Long.class);
        long activeListingsBefore = jdbc.queryForObject(
                "SELECT count(*) FROM listings WHERE site_scope = 'MARKETPLACE' AND status = 'ACTIVE'", Long.class);

        mvc.perform(get("/api/v1/admin/analytics/summary?site=MARKETPLACE").with(user(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalUsers").value(totalUsersBefore))
                .andExpect(jsonPath("$.listingsByStatus.ACTIVE").value((int) activeListingsBefore));
    }

    private VezlistUserPrincipal account(Role role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id, display_name, email, password_hash, enabled) VALUES (?, 'Test member', ?, 'hash', true)", id, id + "@example.test");
        jdbc.update("INSERT INTO user_roles(user_id, role) VALUES (?, ?)", id, role.name());
        return new VezlistUserPrincipal(id, "Test member", id + "@example.test", "hash", true, false, Set.of(role), Instant.now());
    }

    private UUID listing(VezlistUserPrincipal owner, String site, String status) {
        return listing(owner, site, status, site.equals("PERSONALS") ? "personals" : "services");
    }

    private UUID listing(VezlistUserPrincipal owner, String site, String status, String categoryId) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings(id, owner_id, site_scope, status, title, business_name, description,
                    category_id, province_id, location_id, contact_email, contact_phone, submitted_at)
                VALUES (?, ?, ?, ?, 'Admin test listing', 'Business', 'Listing description', ?, 'bc', 'bc-1',
                    'seller@example.test', '+12505550100', now())
                """, id, owner.id(), site, status, categoryId);
        return id;
    }

    private ResultActions postAs(VezlistUserPrincipal actor, String path, Object body) throws Exception {
        return mvc.perform(post(path).with(user(actor)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)));
    }

    private ResultActions patchAs(VezlistUserPrincipal actor, String path, Object body) throws Exception {
        return mvc.perform(patch(path).with(user(actor)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)));
    }
}
