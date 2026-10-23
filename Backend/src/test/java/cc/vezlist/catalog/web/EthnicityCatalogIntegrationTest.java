package cc.vezlist.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

@Tag("integration")
@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class EthnicityCatalogIntegrationTest {
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

    @Test void publicCatalogPreservesSeedOrderAndIsNeverCached() throws Exception {
        var response = mvc.perform(get("/api/v1/ethnicities")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andReturn();
        var labels = new java.util.ArrayList<String>();
        for (var option : json.readTree(response.getResponse().getContentAsString())) {
            assertThat(option.size()).isEqualTo(2);
            assertThat(UUID.fromString(option.get("id").asText())).isNotNull();
            labels.add(option.get("label").asText());
        }
        assertThat(labels).startsWith("Asian", "Black", "Latino / Hispanic", "Middle Eastern", "Mixed", "South Asian", "White", "Other");
    }

    @Test void staffReadButOnlyAdministratorsMayAddOrRetireOptions() throws Exception {
        var member = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        var admin = account(Role.ADMIN);
        mvc.perform(get("/api/v1/admin/ethnicities")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/ethnicities").with(user(member))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/ethnicities").with(user(moderator))).andExpect(status().isOk());
        for (var actor : List.of(member, moderator)) {
            postAs(actor, "/api/v1/admin/ethnicities", Map.of("label", "Unauthorized")).andExpect(status().isForbidden());
            mvc.perform(delete("/api/v1/admin/ethnicities/" + UUID.randomUUID()).with(user(actor)).with(csrf()))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/v1/admin/ethnicities").with(user(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"label\":\"No csrf\"}")).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE actor_id=?", Long.class, moderator.id())).isZero();
    }

    @Test void addingRetiringAndRestoringOptionsAreAuditedAndCaseInsensitive() throws Exception {
        var admin = account(Role.ADMIN);
        String label = "Regional, mixed " + UUID.randomUUID().toString().substring(0, 8);
        JsonNode created = result(postAs(admin, "/api/v1/admin/ethnicities", Map.of("label", "  " + label + "  "))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.label").value(label)));
        String id = created.get("id").asText();
        postAs(admin, "/api/v1/admin/ethnicities", Map.of("label", label.toUpperCase()))
                .andExpect(status().isConflict());
        for (String invalid : List.of("   ", "x".repeat(81))) {
            postAs(admin, "/api/v1/admin/ethnicities", Map.of("label", invalid)).andExpect(status().isBadRequest());
        }
        retire(admin, id);
        for (String path : List.of("/api/v1/ethnicities", "/api/v1/admin/ethnicities")) {
            String body = mvc.perform(get(path).with(user(admin))).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            assertThat(body).doesNotContain(id);
        }
        assertThat(jdbc.queryForObject("SELECT enabled FROM ethnicities WHERE id=?", Boolean.class, UUID.fromString(id))).isFalse();
        postAs(admin, "/api/v1/admin/ethnicities", Map.of("label", label.toUpperCase()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id)).andExpect(jsonPath("$.label").value(label));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE actor_id=? AND target_id=? AND action='ETHNICITY_ADDED'",
                Long.class, admin.id(), id)).isEqualTo(2L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE actor_id=? AND target_id=? AND action='ETHNICITY_REMOVED'",
                Long.class, admin.id(), id)).isEqualTo(1L);
        mvc.perform(delete("/api/v1/admin/ethnicities/" + UUID.randomUUID()).with(user(admin)).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test void retiredAndHistoricalValuesRemainOnExistingAdsButCannotBeNewlySelected() throws Exception {
        var admin = account(Role.ADMIN);
        var owner = account(Role.USER);
        String label = "Custom " + UUID.randomUUID().toString().substring(0, 8);
        String option = result(postAs(admin, "/api/v1/admin/ethnicities", Map.of("label", label))
                .andExpect(status().isCreated())).get("id").asText();
        JsonNode created = createListing(owner, "PERSONALS", " " + label.toLowerCase() + " ", 201);
        String id = created.get("id").asText();
        assertThat(created.get("attributes").get("ethnicity").asText()).isEqualTo(label);
        retire(admin, option);
        patchListing(owner, id, "PERSONALS", label, 200);
        createListing(owner, "PERSONALS", label, 400);
        createListing(owner, "PERSONALS", "Unknown ethnicity", 400);
        patchListing(owner, id, "PERSONALS", "Unknown ethnicity", 400);
        assertThat(jdbc.queryForObject("SELECT attribute_value FROM listing_attributes WHERE listing_id=? AND attribute_key='ethnicity'",
                String.class, UUID.fromString(id))).isEqualTo(label);
        // Simulate a pre-catalog historical value, without rewriting any production data.
        jdbc.update("UPDATE listing_attributes SET attribute_value='Historical value' WHERE listing_id=? AND attribute_key='ethnicity'", UUID.fromString(id));
        patchListing(owner, id, "PERSONALS", "Historical value", 200);
        patchListing(owner, id, "PERSONALS", "Asian", 200);
        patchListing(owner, id, "PERSONALS", "Historical value", 400);
        createListing(owner, "PERSONALS", null, 201);
        createListing(owner, "MARKETPLACE", "Marketplace-specific attribute", 201);
    }

    @Test void discoveryFiltersWholeLabelsIncludingCommasAndBindsCursorsToTheSelectedSet() throws Exception {
        var owner = account(Role.USER);
        String query = "EthnicityFilter" + UUID.randomUUID().toString().substring(0, 8);
        String custom = "Regional, mixed";
        UUID first = activeListing(owner, "PERSONALS", query, custom);
        UUID second = activeListing(owner, "PERSONALS", query, custom);
        UUID asian = activeListing(owner, "PERSONALS", query, "Asian");
        UUID other = activeListing(owner, "PERSONALS", query, "Other");
        activeListing(owner, "PERSONALS", query, "Regional");
        UUID marketplace = activeListing(owner, "MARKETPLACE", query, "Other");
        JsonNode page = search("PERSONALS", query, json.writeValueAsString(List.of(custom)), null, 1, 200);
        String cursor = page.get("nextCursor").asText();
        assertThat(page.get("items").size()).isEqualTo(1);
        JsonNode next = search("PERSONALS", query, json.writeValueAsString(List.of(custom.toUpperCase())), cursor, 1, 200);
        assertThat(Set.of(page.get("items").get(0).get("id").asText(), next.get("items").get(0).get("id").asText()))
                .containsExactlyInAnyOrder(first.toString(), second.toString());
        search("PERSONALS", query, json.writeValueAsString(List.of("Asian")), cursor, 1, 400);
        JsonNode union = search("PERSONALS", query, json.writeValueAsString(List.of(custom, "Asian")), null, 50, 200);
        var ids = new java.util.ArrayList<String>();
        union.get("items").forEach(item -> ids.add(item.get("id").asText()));
        assertThat(ids).containsExactlyInAnyOrder(first.toString(), second.toString(), asian.toString()).doesNotContain(other.toString());
        JsonNode market = search("MARKETPLACE", query, json.writeValueAsString(List.of(custom)), null, 50, 200);
        assertThat(market.get("items").get(0).get("id").asText()).isEqualTo(marketplace.toString());
    }

    @Test void discoveryRejectsMalformedOrUnboundedEthnicityFilters() throws Exception {
        for (String invalid : List.of("Asian", "{}", "[null]", "[3]", "[\"  \"]", json.writeValueAsString(List.of("x".repeat(81))),
                json.writeValueAsString(java.util.Collections.nCopies(21, "Asian")))) {
            search("PERSONALS", "", invalid, null, 50, 400);
        }
    }

    private JsonNode search(String site, String query, String ethnicities, String cursor, int limit, int expected) throws Exception {
        var request = get("/api/v1/listings").param("site", site).param("q", query).param("ethnicities", ethnicities).param("limit", Integer.toString(limit));
        if (cursor != null) request.param("cursor", cursor);
        return result(mvc.perform(request).andExpect(status().is(expected)));
    }
    private UUID activeListing(VezlistUserPrincipal owner, String site, String title, String ethnicity) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings(id,owner_id,site_scope,status,title,business_name,description,category_id,province_id,location_id,contact_email,contact_phone,published_at,expires_at)
                VALUES (?,?,?,'ACTIVE',?,'Advertiser','A detailed listing description',?,'bc','bc-1','test@example.test','+12505550100',now()-interval '1 minute',now()+interval '1 day')
                """, id, owner.id(), site, title, site.equals("PERSONALS") ? "personals" : "services");
        jdbc.update("INSERT INTO listing_attributes(listing_id,attribute_key,attribute_value) VALUES (?,'ethnicity',?)", id, ethnicity);
        return id;
    }
    private JsonNode createListing(VezlistUserPrincipal owner, String site, String ethnicity, int expected) throws Exception {
        return result(postAs(owner, "/api/v1/listings", listingBody(site, ethnicity)).andExpect(status().is(expected)));
    }
    private void patchListing(VezlistUserPrincipal owner, String id, String site, String ethnicity, int expected) throws Exception {
        mvc.perform(patch("/api/v1/listings/" + id).with(user(owner)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsBytes(listingBody(site, ethnicity)))).andExpect(status().is(expected));
    }
    private Map<String,Object> listingBody(String site, String ethnicity) {
        Map<String,Object> body = new LinkedHashMap<>();
        body.put("site", site); body.put("title", "An ethnicity test ad"); body.put("businessName", "Advertiser");
        body.put("description", "A long enough listing description for this test.");
        body.put("categoryId", site.equals("PERSONALS") ? "personals" : "services"); body.put("provinceId", "bc");
        body.put("locationId", "bc-1"); body.put("contactEmail", "test@example.test"); body.put("contactPhone", "+12505550100");
        body.put("attributes", ethnicity == null ? Map.of() : Map.of("ethnicity", ethnicity));
        return body;
    }
    private void retire(VezlistUserPrincipal admin, String id) throws Exception {
        mvc.perform(delete("/api/v1/admin/ethnicities/" + id).with(user(admin)).with(csrf())).andExpect(status().isNoContent());
    }
    private JsonNode result(ResultActions action) throws Exception { return json.readTree(action.andReturn().getResponse().getContentAsString()); }
    private ResultActions postAs(VezlistUserPrincipal actor, String path, Object body) throws Exception {
        return mvc.perform(post(path).with(user(actor)).with(csrf()).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)));
    }
    private VezlistUserPrincipal account(Role role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id,display_name,email,password_hash,enabled) VALUES (?,'Catalog user',?,'hash',true)", id,id+"@example.test");
        jdbc.update("INSERT INTO user_roles(user_id,role) VALUES (?,?)", id,role.name());
        return new VezlistUserPrincipal(id,"Catalog user",id+"@example.test","hash",true,false,Set.of(role),Instant.now());
    }
}
