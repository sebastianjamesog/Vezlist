package cc.vezlist.stories.web;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.net.URI;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.stories.application.StoryService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Tag("integration")
@Testcontainers
@SpringBootTest(properties = "vezlist.stories.demo-purchases-enabled=false")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class StoryIntegrationTest {
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
    @Autowired StoryService stories;
    @MockitoBean ObjectStorage storage;
    private static final byte[] PNG = HexFormat.of().parseHex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082");

    @BeforeEach void storage() {
        when(storage.authorizeUpload(anyString(), anyString(), anyLong(), anyString())).thenReturn(
                new ObjectStorage.UploadTarget(URI.create("https://upload.test/object"), Map.of(), Instant.now().plusSeconds(600)));
        when(storage.authorizeDownload(anyString(), any(Duration.class))).thenReturn(URI.create("https://cdn.test/story"));
    }

    @Test void onlyEnabledAdminsManagePacksAndUpdatesAreVersioned() throws Exception {
        var admin = account(Role.ADMIN);
        var moderator = account(Role.MODERATOR);
        var member = account(Role.USER);
        mvc.perform(get("/api/v1/admin/story-plans")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/story-plans").with(user(moderator))).andExpect(status().isForbidden());
        postAs(member, "/api/v1/admin/story-plans", planBody("5.00", 3, true, 0)).andExpect(status().isForbidden());
        JsonNode plan = body(postAs(admin, "/api/v1/admin/story-plans", planBody("7.50", 3, true, 0)).andExpect(status().isCreated()));
        UUID id = UUID.fromString(plan.get("id").asText());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE target_id=? AND action='STORY_PLAN_CREATED'",
                Integer.class, id.toString())).isEqualTo(1);
        mvc.perform(put("/api/v1/admin/story-plans/" + id).with(user(admin)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(planBody("8.50", 5, false, 0))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(put("/api/v1/admin/story-plans/" + id).with(user(admin)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(planBody("9.50", 5, true, 0))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STORY_PLAN_CHANGED"));
        JsonNode publicPlans = body(mvc.perform(get("/api/v1/stories/plans")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentAvailable").value(false)));
        assertThat(publicPlans.get("items").findValuesAsText("id")).doesNotContain(id.toString());
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=?", admin.id());
        mvc.perform(get("/api/v1/admin/story-plans").with(user(admin))).andExpect(status().isForbidden());
    }

    @Test void databaseAccountTypeRestrictsUploadsAndCannotBeBypassedBySession() throws Exception {
        var creator = account(Role.USER);
        mvc.perform(get("/api/v1/auth/me").with(user(creator))).andExpect(status().isOk())
                .andExpect(jsonPath("$.accountType").value("CREATOR"));
        mvc.perform(patch("/api/v1/auth/account-type").with(user(creator)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"accountType\":\"BROWSING\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accountType").value("BROWSING"));
        upload(creator, PNG, "image/png").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("STORY_CREATOR_REQUIRED"));
        jdbc.update("UPDATE app_users SET account_type='CREATOR',enabled=false WHERE id=?", creator.id());
        upload(creator, PNG, "image/png").andExpect(status().isForbidden());
    }

    @Test void paidPlanCannotPublishWithoutGatewayAndPriceChangesRequireReview() throws Exception {
        var owner = account(Role.USER);
        UUID story = ready(owner);
        UUID plan = plan("5.00", 1);
        publish(owner, story, plan, 0, false).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_UNAVAILABLE"));
        assertThat(jdbc.queryForObject("SELECT status FROM stories WHERE id=?", String.class, story)).isEqualTo("READY");
        jdbc.update("UPDATE story_plans SET version=version+1,price=6 WHERE id=?", plan);
        publish(owner, story, plan, 0, false).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STORY_PLAN_CHANGED"));
        jdbc.update("UPDATE story_plans SET enabled=false WHERE id=?", plan);
        publish(owner, story, plan, 1, false).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STORY_PLAN_UNAVAILABLE"));
    }

    @Test void demoPurchaseCannotBypassDisabledServerMode() throws Exception {
        var owner = account(Role.USER);
        UUID story = ready(owner), plan = plan("12.00", 3);
        mvc.perform(get("/api/v1/stories/plans")).andExpect(status().isOk())
                .andExpect(jsonPath("$.demoPurchaseAvailable").value(false));
        postAs(owner, "/api/v1/stories/" + story + "/publish", Map.of(
                "planId", plan, "planVersion", 0, "demoPurchase", true))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_UNAVAILABLE"));
        assertThat(jdbc.queryForObject("SELECT status FROM stories WHERE id=?", String.class, story)).isEqualTo("READY");
        assertThat(jdbc.queryForObject("SELECT demo_purchase FROM stories WHERE id=?", Boolean.class, story)).isFalse();
    }

    @Test void enabledDemoRequiresExplicitChoiceAndGrantsPackOnlyOnce() throws Exception {
        ReflectionTestUtils.setField(stories, "demoPurchasesEnabled", true);
        try {
            var owner = account(Role.USER);
            UUID first = ready(owner), second = ready(owner), plan = plan("12.00", 3);
            mvc.perform(get("/api/v1/stories/plans")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.paymentAvailable").value(false))
                    .andExpect(jsonPath("$.demoPurchaseAvailable").value(true));
            publish(owner, first, plan, 0, false).andExpect(status().isConflict());
            for (int retry = 0; retry < 2; retry++) {
                postAs(owner, "/api/v1/stories/" + first + "/publish", Map.of(
                        "planId", plan, "planVersion", 0, "demoPurchase", true))
                        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"));
            }
            assertThat(credits(owner)).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT demo_purchase FROM stories WHERE id=?", Boolean.class, first)).isTrue();
            assertThat(jdbc.queryForObject("SELECT price FROM story_plans WHERE id=?", BigDecimal.class, plan)).isEqualByComparingTo("12.00");
            publish(owner, second, plan, 0, true).andExpect(status().isOk());
            assertThat(credits(owner)).isEqualTo(1);
        } finally {
            ReflectionTestUtils.setField(stories, "demoPurchasesEnabled", false);
        }
    }

    @Test void freePackCreditsAreReusableAndRetriesDoNotGrantOrConsumeTwice() throws Exception {
        var owner = account(Role.USER);
        UUID first = ready(owner), second = ready(owner), third = ready(owner), fourth = ready(owner);
        UUID plan = plan("0.00", 3);
        publish(owner, first, plan, 0, false).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"));
        publish(owner, first, plan, 0, false).andExpect(status().isOk());
        assertThat(credits(owner)).isEqualTo(2);
        publish(owner, second, plan, 0, true).andExpect(status().isOk());
        publish(owner, second, plan, 0, true).andExpect(status().isOk());
        assertThat(credits(owner)).isEqualTo(1);
        publish(owner, third, plan, 0, true).andExpect(status().isOk());
        publish(owner, fourth, plan, 0, true).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STORY_NO_CREDITS"));
        assertThat(credits(owner)).isZero();
        assertThat(jdbc.queryForObject("SELECT EXTRACT(EPOCH FROM expires_at-published_at)::bigint FROM stories WHERE id=?", Long.class, first)).isEqualTo(86400L);
    }

    @Test void ownershipIsEnforcedOnEveryMutationAndMyStories() throws Exception {
        var owner = account(Role.USER);
        var other = account(Role.USER);
        UUID story = ready(owner);
        postAs(other, "/api/v1/stories/" + story + "/complete", Map.of()).andExpect(status().isNotFound());
        publish(other, story, plan("0", 1), 0, false).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/stories/" + story).with(user(other)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/stories/me").with(user(other))).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        mvc.perform(delete("/api/v1/stories/" + story).with(user(owner)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/stories/me").with(user(owner))).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
    }

    @Test void expiryAndSuspensionHidePublicStoriesAndNeverRenewExpiredMedia() throws Exception {
        var owner = account(Role.USER);
        UUID story = ready(owner);
        publish(owner, story, plan("0", 1), 0, false).andExpect(status().isOk());
        mvc.perform(get("/api/v1/stories/creator/" + owner.id())).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(story.toString()));
        jdbc.update("UPDATE stories SET expires_at=now()+interval '40 seconds' WHERE id=?", story);
        clearInvocations(storage);
        mvc.perform(get("/api/v1/stories/creator/" + owner.id())).andExpect(status().isOk());
        ArgumentCaptor<Duration> ttl = ArgumentCaptor.forClass(Duration.class);
        verify(storage).authorizeDownload(anyString(), ttl.capture());
        assertThat(ttl.getValue()).isLessThanOrEqualTo(Duration.ofSeconds(40));
        jdbc.update("UPDATE stories SET expires_at=now()-interval '1 second' WHERE id=?", story);
        clearInvocations(storage);
        mvc.perform(get("/api/v1/stories/creator/" + owner.id())).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        mvc.perform(get("/api/v1/stories/me").with(user(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
        verify(storage, never()).authorizeDownload(anyString(), any(Duration.class));
        jdbc.update("UPDATE stories SET expires_at=now()+interval '1 hour' WHERE id=?", story);
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=?", owner.id());
        mvc.perform(get("/api/v1/stories/creator/" + owner.id())).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
    }

    @Test void validatesActualSizeHashAndMagicBeforeMakingMediaReady() throws Exception {
        var owner = account(Role.USER);
        UUID id = UUID.fromString(body(upload(owner, PNG, "image/png").andExpect(status().isCreated())).get("id").asText());
        String key = key(id);
        when(storage.describe(key)).thenReturn(new ObjectStorage.StoredObject(PNG.length - 1, "image/png", Map.of()));
        postAs(owner, "/api/v1/stories/" + id + "/complete", Map.of()).andExpect(status().isBadRequest());
        when(storage.describe(key)).thenReturn(new ObjectStorage.StoredObject(PNG.length, "image/png", Map.of()));
        when(storage.open(key)).thenReturn(new ByteArrayInputStream(new byte[PNG.length]));
        postAs(owner, "/api/v1/stories/" + id + "/complete", Map.of()).andExpect(status().isBadRequest());
        verify(storage, never()).store(anyString(), anyString(), any());
        byte[] fake = new byte[40];
        UUID invalid = UUID.fromString(body(upload(owner, fake, "image/png").andExpect(status().isCreated())).get("id").asText());
        when(storage.describe(key(invalid))).thenReturn(new ObjectStorage.StoredObject(fake.length, "image/png", Map.of()));
        when(storage.open(key(invalid))).thenReturn(new ByteArrayInputStream(fake));
        postAs(owner, "/api/v1/stories/" + invalid + "/complete", Map.of()).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT status FROM stories WHERE id=?", String.class, invalid)).isEqualTo("UPLOADING");
    }

    @Test void completedUploadUsesImmutableKeyAndUnvalidatedDraftCannotPublish() throws Exception {
        var owner = account(Role.USER);
        UUID draft = UUID.fromString(body(upload(owner, PNG, "image/png").andExpect(status().isCreated())).get("id").asText());
        publish(owner, draft, plan("0", 1), 0, false).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STORY_NOT_READY"));
        UUID completed = ready(owner);
        assertThat(key(completed)).startsWith("stories/").doesNotStartWith("story-uploads/");
        verify(storage).store(eq(key(completed)), eq("image/png"), eq(PNG));
    }

    @Test void abandonedUploadsExpireAndReleaseTheDraftQuota() throws Exception {
        var owner = account(Role.USER);
        UUID stale = UUID.fromString(body(upload(owner, PNG, "image/png").andExpect(status().isCreated())).get("id").asText());
        String abandonedKey = key(stale);
        jdbc.update("UPDATE stories SET upload_expires_at=now()-interval '1 second' WHERE id=?", stale);
        postAs(owner, "/api/v1/stories/" + stale + "/complete", Map.of()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STORY_UPLOAD_EXPIRED"));
        upload(owner, PNG, "image/png").andExpect(status().isCreated());
        assertThat(jdbc.queryForObject("SELECT status FROM stories WHERE id=?", String.class, stale)).isEqualTo("DELETED");
        verify(storage).delete(abandonedKey);
        mvc.perform(get("/api/v1/stories/me").with(user(owner))).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test void olderDraftsStayReachableWhenCreatorHasMoreThanTwoHundredPublishedStories() throws Exception {
        var owner = account(Role.USER);
        UUID draft = ready(owner);
        jdbc.update("UPDATE stories SET created_at=now()-interval '2 days' WHERE id=?", draft);
        for (int i = 0; i < 201; i++) {
            jdbc.update("INSERT INTO stories(id,owner_id,object_key,content_type,size_bytes,checksum_sha256,media_type,status,"
                    + "upload_expires_at,published_at,expires_at) VALUES (?,?,'published/test','image/png',1,?,'IMAGE','PUBLISHED',now(),now(),now()+interval '1 hour')",
                    UUID.randomUUID(), owner.id(), "0".repeat(64));
        }
        UUID expiredUpload = UUID.fromString(body(upload(owner, PNG, "image/png").andExpect(status().isCreated())).get("id").asText());
        jdbc.update("UPDATE stories SET upload_expires_at=now()-interval '1 second' WHERE id=?", expiredUpload);
        JsonNode result = body(mvc.perform(get("/api/v1/stories/me").with(user(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(200)).andExpect(jsonPath("$.items[0].id").value(draft.toString())));
        assertThat(result.get("items").findValuesAsText("id")).doesNotContain(expiredUpload.toString());
    }

    private int credits(VezlistUserPrincipal owner) { return jdbc.queryForObject("SELECT credits FROM story_credits WHERE owner_id=?", Integer.class, owner.id()); }
    private String key(UUID story) { return jdbc.queryForObject("SELECT object_key FROM stories WHERE id=?", String.class, story); }
    private UUID ready(VezlistUserPrincipal actor) throws Exception {
        UUID id = UUID.fromString(body(upload(actor, PNG, "image/png").andExpect(status().isCreated())).get("id").asText());
        String key = key(id);
        when(storage.describe(key)).thenReturn(new ObjectStorage.StoredObject(PNG.length, "image/png", Map.of()));
        when(storage.open(key)).thenAnswer(invocation -> new ByteArrayInputStream(PNG));
        postAs(actor, "/api/v1/stories/" + id + "/complete", Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("READY"));
        return id;
    }
    private ResultActions upload(VezlistUserPrincipal actor, byte[] bytes, String type) throws Exception {
        return postAs(actor, "/api/v1/stories/uploads", Map.of("filename", "story.png", "contentType", type, "sizeBytes", bytes.length,
                "checksumSha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))));
    }
    private ResultActions publish(VezlistUserPrincipal actor, UUID story, UUID plan, long version, boolean credit) throws Exception {
        return postAs(actor, "/api/v1/stories/" + story + "/publish", Map.of("planId", plan, "planVersion", version, "useCredit", credit));
    }
    private Map<String, Object> planBody(String price, int count, boolean enabled, long version) {
        return Map.of("name", "Test pack", "price", new BigDecimal(price), "currency", "CAD", "storyCount", count,
                "enabled", enabled, "sortOrder", 4, "version", version);
    }
    private UUID plan(String price, int count) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO story_plans(id,name,price,story_count) VALUES (?,'Test pack',?,?)", id, new BigDecimal(price), count);
        return id;
    }
    private VezlistUserPrincipal account(Role role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id, display_name, email, password_hash, enabled) VALUES (?, 'Story creator', ?, 'hash', true)", id, id + "@example.test");
        jdbc.update("INSERT INTO user_roles(user_id, role) VALUES (?, ?)", id, role.name());
        return new VezlistUserPrincipal(id, "Story creator", id + "@example.test", "hash", true, false, Set.of(role), Instant.now());
    }
    private JsonNode body(ResultActions action) throws Exception { return json.readTree(action.andReturn().getResponse().getContentAsString()); }
    private ResultActions postAs(VezlistUserPrincipal actor, String path, Object body) throws Exception {
        return mvc.perform(post(path).with(user(actor)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)));
    }
}
