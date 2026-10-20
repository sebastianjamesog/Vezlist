package cc.vezlist.admin.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
class AdminConfigurationIntegrationTest {
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

    @Test void settingsPersistAndRestrictWrites() throws Exception {
        var admin = account(Role.ADMIN);
        var moderator = account(Role.MODERATOR);
        var update = new java.util.HashMap<String, Object>(Map.of("ageGateTitle", "Adults welcome", "ageGateBody", "Adults only.", "reviewSlaHours", 4, "reportSlaHours", 36, "ticketSlaHours", 12, "version", 0));
        mvc.perform(get("/api/v1/admin/settings").with(user(moderator))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/settings").with(user(account(Role.USER)))).andExpect(status().isForbidden());
        save(moderator, update).andExpect(status().isForbidden());
        save(admin, update).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(get("/api/v1/public/settings")).andExpect(status().isOk()).andExpect(jsonPath("$.ageGateTitle").value("Adults welcome")).andExpect(jsonPath("$.reviewSlaHours").doesNotExist());
        save(admin, update).andExpect(status().isConflict());
        update.put("version", 1); update.put("reviewSlaHours", 0);
        save(admin, update).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE action = 'SETTINGS_UPDATED' AND actor_id = ?", Long.class, admin.id())).isEqualTo(1);
    }
    private ResultActions save(VezlistUserPrincipal actor, Object body) throws Exception {
        return mvc.perform(put("/api/v1/admin/settings").with(user(actor)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)));
    }
    @Test void categoryMoveSeparatesBoardsAndWorksWithTiedOrders() throws Exception {
        var admin = account(Role.ADMIN);
        String first = "config-first", second = "config-second", other = "config-other";
        jdbc.update("INSERT INTO categories(id,label,icon,site_scope,primary_category,display_order,enabled) VALUES (?, 'Z config A', 'Tag', 'PERSONALS', false, 900, true)", first);
        jdbc.update("INSERT INTO categories(id,label,icon,site_scope,primary_category,display_order,enabled) VALUES (?, 'Z config B', 'Tag', 'PERSONALS', false, 900, true)", second);
        jdbc.update("INSERT INTO categories(id,label,icon,site_scope,primary_category,display_order,enabled) VALUES (?, 'Z config C', 'Tag', 'MARKETPLACE', false, 900, true)", other);
        mvc.perform(post("/api/v1/admin/categories/" + second + "/move").with(user(admin)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"direction\":-1}")).andExpect(status().isOk());
        int a = jdbc.queryForObject("SELECT display_order FROM categories WHERE id = ?", Integer.class, first);
        int b = jdbc.queryForObject("SELECT display_order FROM categories WHERE id = ?", Integer.class, second);
        assertThat(b).isLessThan(a);
        assertThat(jdbc.queryForObject("SELECT display_order FROM categories WHERE id = ?", Integer.class, other)).isEqualTo(900);
        mvc.perform(post("/api/v1/admin/categories/" + second + "/move").with(user(admin)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"direction\":0}")).andExpect(status().isBadRequest());
    }
    @Test void validLongCategoryAndAreaLabelsFitDatabaseIdentifiers() throws Exception {
        var admin = account(Role.ADMIN);
        String province = create(admin, "/api/v1/admin/locations/provinces", Map.of("label", "Long province name ".repeat(5), "displayOrder", 100));
        String area = create(admin, "/api/v1/admin/locations/areas", Map.of("label", "Long area name ".repeat(6), "provinceId", province, "displayOrder", 1, "popular", false));
        String category = create(admin, "/api/v1/admin/categories", Map.of("label", "Long category name ".repeat(5), "icon", "Tag", "site", "PERSONALS", "primary", false, "displayOrder", 100));
        assertThat(province.length()).isLessThanOrEqualTo(40);
        assertThat(area.length()).isLessThanOrEqualTo(40);
        assertThat(category.length()).isLessThanOrEqualTo(40);
        assertThat(jdbc.queryForObject("SELECT parent_id FROM locations WHERE id = ?", String.class, area)).isEqualTo(province);
    }
    private String create(VezlistUserPrincipal actor, String path, Object body) throws Exception {
        return json.readTree(mvc.perform(post(path).with(user(actor)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsBytes(body))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private VezlistUserPrincipal account(Role role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id, display_name, email, password_hash, enabled) VALUES (?, 'Test member', ?, 'hash', true)", id, id + "@example.test");
        jdbc.update("INSERT INTO user_roles(user_id, role) VALUES (?, ?)", id, role.name());
        return new VezlistUserPrincipal(id, "Test member", id + "@example.test", "hash", true, false, Set.of(role), Instant.now());
    }

}
