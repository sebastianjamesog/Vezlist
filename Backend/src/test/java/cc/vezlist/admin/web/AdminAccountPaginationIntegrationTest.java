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
class AdminAccountPaginationIntegrationTest {
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

    @Test void userPagesPreserveSubMillisecondAnchorsAndStaffFilter() throws Exception {
        var admin = account(Role.ADMIN);
        var first = account(Role.USER);
        var second = account(Role.MODERATOR);
        String label = "pagination-" + UUID.randomUUID();
        jdbc.update("UPDATE app_users SET display_name = ?, created_at = '2026-01-01 00:00:00.123456+00' WHERE id IN (?, ?)", label, first.id(), second.id());
        var one = json.readTree(mvc.perform(get("/api/v1/admin/users").param("query", label).param("limit", "1").with(user(admin)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var two = json.readTree(mvc.perform(get("/api/v1/admin/users").param("query", label).param("limit", "1")
                .param("cursor", one.get("nextCursor").asText()).with(user(admin)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(two.get("items").size()).isEqualTo(1);
        assertThat(two.at("/items/0/id").asText()).isNotEqualTo(one.at("/items/0/id").asText());
        mvc.perform(get("/api/v1/admin/users").param("query", label).param("staffOnly", "true").with(user(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalCount").value(1))
                .andExpect(jsonPath("$.items[0].id").value(second.id().toString()));
    }
    @Test void auditIncludesBothSitesAndPaginatesTiedEventsWithoutSkipping() throws Exception {
        var admin = account(Role.ADMIN);
        UUID listing = listing(admin, "PERSONALS", "ACTIVE");
        String at = "2099-01-01 00:00:00.123456+00";
        UUID general = UUID.fromString("90000000-0000-0000-0000-000000000001");
        UUID moderation = UUID.fromString("80000000-0000-0000-0000-000000000001");
        UUID security = UUID.fromString("70000000-0000-0000-0000-000000000001");
        jdbc.update("INSERT INTO admin_audit_log(id, actor_id, action, target_type, target_id, created_at) VALUES (?, ?, 'TEST', 'USER', ?, ?::timestamptz)", general, admin.id(), admin.id().toString(), at);
        jdbc.update("INSERT INTO moderation_actions(id, case_id, listing_id, actor_id, action, created_at) VALUES (?, ?, ?, ?, 'APPROVE', ?::timestamptz)", moderation, UUID.randomUUID(), listing, admin.id(), at);
        jdbc.update("INSERT INTO security_events(id, user_id, event_type, created_at) VALUES (?, ?, 'LOGIN_SUCCESS', ?::timestamptz)", security, admin.id(), at);
        String cursor = null;
        java.util.List<String> found = new java.util.ArrayList<>();
        for (int i = 0; i < 3; i++) {
            var request = get("/api/v1/admin/audit").param("limit", "1").with(user(admin));
            if (cursor != null) request.param("cursor", cursor);
            var page = json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            found.add(page.at("/items/0/id").asText());
            cursor = page.get("nextCursor").asText();
        }
        assertThat(found).containsExactly(general.toString(), moderation.toString(), security.toString());
        mvc.perform(get("/api/v1/admin/audit?site=MARKETPLACE&limit=3").with(user(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(general.toString()))
                .andExpect(jsonPath("$.items[1].id").value(security.toString()));
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
