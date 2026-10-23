package cc.vezlist.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Executors;
import cc.vezlist.catalog.application.CatalogService;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.dao.DataAccessException;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
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
class LocationHierarchyIntegrationTest {
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
    @Autowired CatalogService catalog;
    @Autowired TransactionTemplate transaction;

    @Test void administratorsManageNeighbourhoodsAndModeratorsCanOnlyRead() throws Exception {
        var admin = account(Role.ADMIN);
        var moderator = account(Role.MODERATOR);
        var member = account(Role.USER);
        Tree tree = tree(admin);
        for (var actor : List.of(moderator, member)) {
            postAs(actor, "/api/v1/admin/locations/neighbourhoods", neighbourhood("Forbidden", tree.area))
                    .andExpect(status().isForbidden());
            mvc.perform(patch("/api/v1/admin/locations/" + tree.neighbourhood).with(user(actor)).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(update("Forbidden", true))))
                    .andExpect(status().isForbidden());
            mvc.perform(delete("/api/v1/admin/locations/" + tree.neighbourhood).with(user(actor)).with(csrf()))
                    .andExpect(status().isForbidden());
        }
        JsonNode listed = result(mvc.perform(get("/api/v1/admin/locations").param("provinceId", tree.province).with(user(moderator)))
                .andExpect(status().isOk()));
        assertThat(ids(listed)).containsExactlyInAnyOrder(tree.province, tree.area, tree.neighbourhood);
        updateLocation(admin, tree.neighbourhood, "Renamed neighbourhood", true);
        mvc.perform(delete("/api/v1/admin/locations/" + tree.neighbourhood).with(user(admin)).with(csrf()))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM locations WHERE id=?", Long.class, tree.neighbourhood)).isZero();
        assertThat(jdbc.queryForList("SELECT action FROM admin_audit_log WHERE actor_id=? AND target_id=?", String.class, admin.id(), tree.neighbourhood))
                .containsExactlyInAnyOrder("NEIGHBOURHOOD_CREATED", "LOCATION_UPDATED", "NEIGHBOURHOOD_DELETED");
    }

    @Test void parentValidationRejectsWrongLevelsAndDatabaseConstraintsProtectTheHierarchy() throws Exception {
        var admin = account(Role.ADMIN);
        Tree tree = tree(admin);
        for (String parent : List.of(tree.province, tree.neighbourhood)) {
            postAs(admin, "/api/v1/admin/locations/neighbourhoods", neighbourhood("Wrong parent", parent))
                    .andExpect(status().isBadRequest());
        }
        postAs(admin, "/api/v1/admin/locations/neighbourhoods", neighbourhood("Missing parent", "missing"))
                .andExpect(status().isNotFound());
        postAs(admin, "/api/v1/admin/locations/areas", Map.of("label", "Wrong area", "provinceId", tree.area, "displayOrder", 0, "popular", false))
                .andExpect(status().isBadRequest());
        postAs(admin, "/api/v1/admin/locations/neighbourhoods", neighbourhood("Neighbourhood", tree.area))
                .andExpect(status().isConflict());
        assertThatThrownBy(() -> jdbc.update("INSERT INTO locations(id,parent_id,label,location_type,display_order) VALUES ('invalid-neighbourhood',?,'Invalid','NEIGHBOURHOOD',0)", tree.province))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE locations SET parent_id=? WHERE id=?", tree.neighbourhood, tree.area))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE locations SET location_type='AREA',parent_id='on' WHERE id=?", tree.province))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test void publicCatalogAndSearchExposeCorrectAncestryAndRespectEveryEnabledAncestor() throws Exception {
        var admin = account(Role.ADMIN);
        Tree tree = tree(admin);
        var response = mvc.perform(get("/api/v1/locations")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-cache")).andReturn();
        JsonNode catalog = json.readTree(response.getResponse().getContentAsString());
        JsonNode province = find(catalog.get("provinces"), tree.province);
        JsonNode area = find(province.get("areas"), tree.area);
        assertThat(area.get("type").asText()).isEqualTo("AREA");
        assertThat(area.get("areaId").asText()).isEqualTo(tree.area);
        JsonNode leaf = find(area.get("neighbourhoods"), tree.neighbourhood);
        assertThat(leaf.get("type").asText()).isEqualTo("NEIGHBOURHOOD");
        assertThat(leaf.get("provinceId").asText()).isEqualTo(tree.province);
        assertThat(leaf.get("provinceLabel").asText()).isEqualTo(tree.provinceLabel);
        assertThat(leaf.get("areaId").asText()).isEqualTo(tree.area);
        assertThat(leaf.get("areaLabel").asText()).isEqualTo("Metro area");
        assertThat(ids(catalog.get("popularAreas"))).contains(tree.neighbourhood);
        assertThat(ids(searchLocations(tree.provinceLabel))).containsExactlyInAnyOrder(tree.area, tree.neighbourhood);
        updateLocation(admin, tree.neighbourhood, "Renamed local place", true);
        assertThat(find(searchLocations("Renamed local place"), tree.neighbourhood).get("provinceId").asText()).isEqualTo(tree.province);
        updateLocation(admin, tree.area, "Metro area", false);
        assertThat(ids(searchLocations(tree.provinceLabel))).doesNotContain(tree.area, tree.neighbourhood);
        updateLocation(admin, tree.area, "Metro area", true);
        updateLocation(admin, tree.province, tree.provinceLabel, false);
        assertThat(ids(searchLocations(tree.provinceLabel))).doesNotContain(tree.area, tree.neighbourhood);
        JsonNode hidden = result(mvc.perform(get("/api/v1/locations")).andExpect(status().isOk()));
        assertThat(ids(hidden.get("provinces"))).doesNotContain(tree.province);
        assertThat(ids(hidden.get("popularAreas"))).doesNotContain(tree.neighbourhood);
    }

    @ParameterizedTest
    @ValueSource(strings={"MARKETPLACE", "PERSONALS"})
    void bothBoardsAcceptNeighbourhoodsAndLegacyAreasButRejectMismatchedOrDisabledAncestors(String site) throws Exception {
        var admin = account(Role.ADMIN);
        var owner = account(Role.USER);
        Tree tree = tree(admin);
        JsonNode leaf = createListing(owner, site, tree.province, tree.neighbourhood, "Hierarchy ad", 201);
        assertThat(leaf.get("provinceId").asText()).isEqualTo(tree.province);
        assertThat(leaf.get("provinceLabel").asText()).isEqualTo(tree.provinceLabel);
        assertThat(leaf.get("locationType").asText()).isEqualTo("NEIGHBOURHOOD");
        assertThat(leaf.get("areaId").asText()).isEqualTo(tree.area);
        JsonNode legacy = createListing(owner, site, tree.province, tree.area, "Legacy area ad", 201);
        assertThat(legacy.get("locationId").asText()).isEqualTo(tree.area);
        assertThat(legacy.get("locationType").asText()).isEqualTo("AREA");
        createListing(owner, site, "bc", tree.neighbourhood, "Wrong province", 400);
        createListing(owner, site, tree.province, tree.province, "Province not leaf", 400);
        updateLocation(admin, tree.neighbourhood, "Neighbourhood", false);
        createListing(owner, site, tree.province, tree.neighbourhood, "Disabled leaf", 400);
        updateLocation(admin, tree.neighbourhood, "Neighbourhood", true);
        updateLocation(admin, tree.area, "Metro area", false);
        createListing(owner, site, tree.province, tree.neighbourhood, "Disabled area", 400);
        updateLocation(admin, tree.area, "Metro area", true);
        updateLocation(admin, tree.province, tree.provinceLabel, false);
        createListing(owner, site, tree.province, tree.neighbourhood, "Disabled province", 400);
        assertThat(jdbc.queryForObject("SELECT location_id FROM listings WHERE id=?", String.class, UUID.fromString(legacy.get("id").asText()))).isEqualTo(tree.area);
        assertThat(jdbc.queryForObject("SELECT location_id FROM listings WHERE id=?", String.class, UUID.fromString(leaf.get("id").asText()))).isEqualTo(tree.neighbourhood);
    }

    @ParameterizedTest
    @ValueSource(strings={"MARKETPLACE", "PERSONALS"})
    void areaAndProvinceFiltersIncludeDescendantsWhileNeighbourhoodFiltersRemainExact(String site) throws Exception {
        var admin = account(Role.ADMIN);
        var owner = account(Role.USER);
        Tree tree = tree(admin);
        String otherArea = result(postAs(admin, "/api/v1/admin/locations/areas", Map.of("label", "Other area", "provinceId", tree.province, "displayOrder", 2, "popular", false))
                .andExpect(status().isCreated())).get("id").asText();
        String otherLeaf = result(postAs(admin, "/api/v1/admin/locations/neighbourhoods", neighbourhood("Neighbourhood", otherArea))
                .andExpect(status().isCreated())).get("id").asText();
        String sibling = result(postAs(admin, "/api/v1/admin/locations/neighbourhoods", neighbourhood("Sibling", tree.area))
                .andExpect(status().isCreated())).get("id").asText();
        String title = "HierarchyFilter" + UUID.randomUUID().toString().substring(0, 8);
        String legacy = publish(owner, site, tree.province, tree.area, title);
        String child = publish(owner, site, tree.province, tree.neighbourhood, title);
        String siblingAd = publish(owner, site, tree.province, sibling, title);
        String outside = publish(owner, site, tree.province, otherLeaf, title);
        JsonNode areaPage = search(site, title, tree.province, tree.area, false, 50, null);
        assertThat(ids(areaPage.get("items"))).containsExactlyInAnyOrder(legacy, child, siblingAd);
        assertThat(ids(search(site, title, tree.province, tree.neighbourhood, false, 50, null).get("items"))).containsExactly(child);
        assertThat(ids(search(site, title, tree.province, null, false, 50, null).get("items"))).containsExactlyInAnyOrder(legacy, child, siblingAd, outside);
        assertThat(ids(search(site, title, tree.province, tree.area, true, 50, null))).containsExactlyInAnyOrder(legacy, child, siblingAd);
        assertThat(ids(search(site, title, tree.province, tree.neighbourhood, true, 50, null))).containsExactly(child);
        JsonNode first = search(site, title, tree.province, tree.area, false, 1, null);
        mvc.perform(get("/api/v1/listings").param("site",site).param("q",title).param("province",tree.province)
                .param("area",tree.neighbourhood).param("limit","1").param("cursor",first.get("nextCursor").asText()))
                .andExpect(status().isBadRequest());
    }

    @Test void deletingLocationsWithChildrenOrAnyHistoricalAdIsAConflict() throws Exception {
        var admin = account(Role.ADMIN);
        var owner = account(Role.USER);
        Tree tree = tree(admin);
        for(String id:List.of(tree.province,tree.area)) {
            mvc.perform(delete("/api/v1/admin/locations/"+id).with(user(admin)).with(csrf())).andExpect(status().isConflict());
        }
        JsonNode listing = createListing(owner,"MARKETPLACE",tree.province,tree.neighbourhood,"Historical ad",201);
        for(String state:List.of("DRAFT","ACTIVE","EXPIRED","DELETED")) {
            jdbc.update("UPDATE listings SET status=? WHERE id=?",state,UUID.fromString(listing.get("id").asText()));
            mvc.perform(delete("/api/v1/admin/locations/"+tree.neighbourhood).with(user(admin)).with(csrf())).andExpect(status().isConflict());
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM locations WHERE id=?",Long.class,tree.neighbourhood)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE target_id=? AND action='NEIGHBOURHOOD_DELETED'",Long.class,tree.neighbourhood)).isZero();
    }

    @Test void featuredCardsKeepTheActualProvinceAndNeighbourhoodLabel() throws Exception {
        var admin=account(Role.ADMIN); var owner=account(Role.USER); Tree tree=tree(admin);
        String id=publish(owner,"PERSONALS",tree.province,tree.neighbourhood,"Featured neighbourhood");
        jdbc.update("INSERT INTO user_preferences(user_id,available_now,available_until) VALUES (?,true,now()+interval '1 hour') ON CONFLICT(user_id) DO UPDATE SET available_now=true,available_until=EXCLUDED.available_until",owner.id());
        JsonNode page=result(mvc.perform(get("/api/v1/personals/featured").param("feed","AVAILABLE_NOW").param("all","true")).andExpect(status().isOk()));
        JsonNode card=find(page.get("items"),id);
        assertThat(card.get("provinceLabel").asText()).isEqualTo(tree.provinceLabel);
        assertThat(card.get("locationLabel").asText()).isEqualTo("Neighbourhood");
    }

    @Test void ancestryValidationHoldsParentsStableUntilTheListingTransactionCompletes() throws Exception {
        var admin = account(Role.ADMIN);
        Tree tree = tree(admin);
        CountDownLatch validated = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (var executor = Executors.newSingleThreadExecutor()) {
            var writer = executor.submit(() -> transaction.execute(status -> {
                catalog.requireEnabledLocation(tree.province, tree.neighbourhood);
                validated.countDown();
                try { if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Test writer timed out"); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); }
                return null;
            }));
            try {
                assertThat(validated.await(3, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> transaction.execute(status -> {
                    jdbc.execute("SET LOCAL lock_timeout='200ms'");
                    jdbc.update("UPDATE locations SET enabled=false WHERE id=?", tree.area);
                    return null;
                })).isInstanceOf(DataAccessException.class).hasMessageContaining("lock timeout");
            } finally {
                release.countDown();
                writer.get(3, TimeUnit.SECONDS);
            }
        }
        updateLocation(admin, tree.area, "Metro area", false);
        assertThatThrownBy(() -> catalog.requireEnabledLocation(tree.province, tree.neighbourhood))
                .isInstanceOf(cc.vezlist.catalog.application.CatalogReferenceInvalidException.class);
    }

    private JsonNode search(String site,String title,String province,String area,boolean map,int limit,String cursor) throws Exception {
        var request=get(map?"/api/v1/listings/map":"/api/v1/listings").param("site",site).param("q",title).param("province",province).param("limit",Integer.toString(limit));
        if(area!=null) request.param("area",area);
        if(cursor!=null) request.param("cursor",cursor);
        if(map) request.param("latitude","43.7").param("longitude","-79.3").param("radiusKm","100");
        return result(mvc.perform(request).andExpect(status().isOk()));
    }
    private JsonNode searchLocations(String query) throws Exception {
        return result(mvc.perform(get("/api/v1/locations/search").param("q",query).param("limit","50")).andExpect(status().isOk()));
    }
    private Tree tree(VezlistUserPrincipal admin) throws Exception {
        String label="Province "+UUID.randomUUID().toString().substring(0,8);
        String province=result(postAs(admin,"/api/v1/admin/locations/provinces",Map.of("label",label,"displayOrder",999)).andExpect(status().isCreated())).get("id").asText();
        String area=result(postAs(admin,"/api/v1/admin/locations/areas",Map.of("label","Metro area","provinceId",province,"displayOrder",1,"popular",false)).andExpect(status().isCreated())).get("id").asText();
        String leaf=result(postAs(admin,"/api/v1/admin/locations/neighbourhoods",neighbourhood("Neighbourhood",area)).andExpect(status().isCreated())).get("id").asText();
        return new Tree(province,label,area,leaf);
    }
    private Map<String,Object> neighbourhood(String label,String area) {return Map.of("label",label,"areaId",area,"displayOrder",1,"popular",true);}
    private Map<String,Object> update(String label,boolean enabled) {return Map.of("label",label,"displayOrder",1,"popular",true,"enabled",enabled);}
    private void updateLocation(VezlistUserPrincipal actor,String id,String label,boolean enabled) throws Exception {
        mvc.perform(patch("/api/v1/admin/locations/"+id).with(user(actor)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(update(label,enabled)))).andExpect(status().isOk());
    }
    private String publish(VezlistUserPrincipal owner,String site,String province,String location,String title) throws Exception {
        String id=createListing(owner,site,province,location,title,201).get("id").asText();
        jdbc.update("UPDATE listings SET status='ACTIVE',published_at=now()-interval '1 minute',expires_at=now()+interval '1 day' WHERE id=?",UUID.fromString(id));
        return id;
    }
    private JsonNode createListing(VezlistUserPrincipal owner,String site,String province,String location,String title,int expected) throws Exception {
        Map<String,Object> body=new LinkedHashMap<>();
        body.put("site",site);body.put("title",title);body.put("businessName","Advertiser");body.put("description","A sufficiently detailed description for a location test.");
        body.put("categoryId",site.equals("PERSONALS")?"personals":"services");body.put("provinceId",province);body.put("locationId",location);
        body.put("contactEmail","test@example.test");body.put("contactPhone","+12505550100");body.put("latitude",43.7);body.put("longitude",-79.3);body.put("attributes",Map.of());
        return result(postAs(owner,"/api/v1/listings",body).andExpect(status().is(expected)));
    }
    private List<String> ids(JsonNode rows) {var result=new ArrayList<String>();rows.forEach(row->result.add(row.get("id").asText()));return result;}
    private JsonNode find(JsonNode rows,String id) {for(var row:rows) if(row.get("id").asText().equals(id))return row;throw new AssertionError("Missing row "+id+" in "+rows);}
    private JsonNode result(ResultActions action) throws Exception {return json.readTree(action.andReturn().getResponse().getContentAsString());}
    private ResultActions postAs(VezlistUserPrincipal actor,String path,Object body) throws Exception {
        return mvc.perform(post(path).with(user(actor)).with(csrf()).header("Idempotency-Key",UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)));
    }
    private VezlistUserPrincipal account(Role role) {
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO app_users(id,display_name,email,password_hash,enabled) VALUES (?,'Location user',?,'hash',true)",id,id+"@example.test");
        jdbc.update("INSERT INTO user_roles(user_id,role) VALUES (?,?)",id,role.name());
        return new VezlistUserPrincipal(id,"Location user",id+"@example.test","hash",true,false,Set.of(role),Instant.now());
    }
    private record Tree(String province,String provinceLabel,String area,String neighbourhood) {}
}
