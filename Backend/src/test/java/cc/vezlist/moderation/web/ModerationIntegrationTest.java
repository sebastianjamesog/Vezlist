package cc.vezlist.moderation.web;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.moderation.application.ModerationException;
import cc.vezlist.moderation.application.ModerationService;
import cc.vezlist.moderation.domain.ModerationPolicy.ReportReason;
import cc.vezlist.moderation.web.ModerationRequests.Report;
import cc.vezlist.shared.domain.SiteScope;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
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
class ModerationIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired ModerationService service;
    @MockitoBean ObjectStorage storage;
    @BeforeEach void storage() {
        given(storage.authorizeDownload(anyString())).willAnswer(i -> URI.create("https://media.test/" + i.getArgument(0)));
    }

    @Test void submissionsQueueAutomaticallyAndStaffCannotSelfApprove() throws Exception {
        var owner = account(Role.ADMIN);
        UUID listing = listing(owner, "MARKETPLACE", "PENDING_REVIEW");
        UUID review = review(listing);
        mvc.perform(get("/api/v1/moderation/cases?site=MARKETPLACE")).andExpect(status().isUnauthorized());
        var regular = account(Role.USER);
        mvc.perform(get("/api/v1/moderation/cases?site=MARKETPLACE").with(user(regular))).andExpect(status().isForbidden());
        post(owner, path(review, "assignment"), Map.of("assigneeId", owner.id())).andExpect(status().isForbidden());
        post(owner, path(review, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isForbidden());
        assertThat(statusOf(listing)).isEqualTo("PENDING_REVIEW");
        assertThat(events(listing)).isZero();
        var moderator = account(Role.MODERATOR);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path(review, "assignment")).with(user(moderator)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsBytes(Map.of("assigneeId", moderator.id())))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/moderation/cases?site=MARKETPLACE&limit=51").with(user(moderator))).andExpect(status().isBadRequest());
    }

    @Test void marketplaceApprovalRequiresClaimAndMediaAndPublishesAtomically() throws Exception {
        var owner = account(Role.USER); var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "MARKETPLACE", "PENDING_REVIEW"); UUID review = review(listing);
        post(moderator, path(review, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isConflict());
        claim(moderator, review);
        post(moderator, path(review, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isConflict());
        UUID media = media(listing);
        post(moderator, path(review, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isConflict());
        checkMedia(moderator, review, media);
        post(moderator, path(review, "decisions"), Map.of("decision", "APPROVE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.listingStatus").value("ACTIVE"));
        post(moderator, path(review, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isOk());
        assertThat(events(listing)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_actions WHERE case_id = ? AND action = 'APPROVE'", Long.class, review)).isEqualTo(1);
        mvc.perform(get("/api/v1/listings/" + listing + "?site=MARKETPLACE")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/moderation/cases/" + review).with(user(moderator)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.policy.approvalsRequired").value(1));
    }

    @Test void personalsRequiresTwoDistinctEligibleReviewersAndIndividualMediaChecks() throws Exception {
        var owner = account(Role.USER); var first = account(Role.MODERATOR); var second = account(Role.MODERATOR);
        UUID listing = listing(owner, "PERSONALS", "PENDING_REVIEW"); UUID review = review(listing); UUID media = media(listing);
        claim(first, review); checkMedia(first, review, media);
        post(first, path(review, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isConflict());
        post(first, path(review, "decisions"), Map.of("decision", "APPROVE", "eligibilityChecked", true))
                .andExpect(status().isOk()).andExpect(jsonPath("$.listingStatus").value("PENDING_REVIEW"));
        post(first, path(review, "assignment"), Map.of("assigneeId", first.id())).andExpect(status().isConflict());
        assertThat(events(listing)).isZero();
        claim(second, review);
        post(second, path(review, "decisions"), Map.of("decision", "APPROVE", "eligibilityChecked", true)).andExpect(status().isConflict());
        checkMedia(second, review, media);
        post(second, path(review, "decisions"), Map.of("decision", "APPROVE", "eligibilityChecked", true))
                .andExpect(status().isOk()).andExpect(jsonPath("$.approvals").value(2)).andExpect(jsonPath("$.caseStatus").value("CLOSED"));
        assertThat(statusOf(listing)).isEqualTo("ACTIVE");
        assertThat(events(listing)).isEqualTo(1);
    }

    @Test void rejectionExposesOnlySafeReasonAndAppealsAreOwnedAndIdempotent() throws Exception {
        var owner = account(Role.USER); var moderator = account(Role.MODERATOR); var other = account(Role.USER);
        UUID listing = listing(owner, "MARKETPLACE", "PENDING_REVIEW"); UUID review = review(listing);
        claim(moderator, review);
        post(moderator, path(review, "decisions"), Map.of("decision", "REJECT", "note", "private internal note"))
                .andExpect(status().isBadRequest());
        assertThat(events(listing)).isZero();
        post(moderator, path(review, "decisions"), Map.of("decision", "REJECT", "reason", "MISLEADING_CONTENT", "note", "private internal note"))
                .andExpect(status().isOk());
        String ownerPath = "/api/v1/me/listings/" + listing + "/moderation";
        var result = mvc.perform(get(ownerPath + "?site=MARKETPLACE").with(user(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.appealAllowed").value(true))
                .andExpect(jsonPath("$.publicReason").value("Please correct misleading or inaccurate information."));
        assertThat(result.andReturn().getResponse().getContentAsString()).doesNotContain("private internal note", "actor", "reporter");
        mvc.perform(get(ownerPath + "?site=MARKETPLACE").with(user(other))).andExpect(status().isNotFound());
        mvc.perform(get(ownerPath + "?site=PERSONALS").with(user(owner))).andExpect(status().isNotFound());
        var body = Map.of("site", "MARKETPLACE", "message", "Please review the decision.");
        post(other, ownerPath + "/appeals", body).andExpect(status().isNotFound());
        String appeal = id(post(owner, ownerPath + "/appeals", body).andExpect(status().isOk()));
        assertThat(id(post(owner, ownerPath + "/appeals", body).andExpect(status().isOk()))).isEqualTo(appeal);
        mvc.perform(get(ownerPath + "?site=MARKETPLACE").with(user(owner))).andExpect(jsonPath("$.appealAllowed").value(false));
        UUID newCase = UUID.fromString(appeal);
        jdbc.update("UPDATE listings SET save_count = save_count + 1, version = version + 1 WHERE id = ?", listing);
        mvc.perform(get(ownerPath + "?site=MARKETPLACE").with(user(owner))).andExpect(jsonPath("$.appealAllowed").value(false));
        claim(moderator, newCase);
        jdbc.update("UPDATE listings SET title = 'Changed after appeal', version = version + 1 WHERE id = ?", listing);
        post(moderator, path(newCase, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isConflict());
        jdbc.update("UPDATE listings SET status = 'PENDING_REVIEW', version = version + 1 WHERE id = ?", listing);
        assertThat(review(listing)).isNotEqualTo(newCase);
        assertThat(jdbc.queryForObject("SELECT status FROM moderation_cases WHERE id = ?", String.class, newCase)).isEqualTo("CLOSED");
    }

    @Test void reportsAreScopedDeduplicatedAndRemovalHidesPublicListing() throws Exception {
        var owner = account(Role.USER); var reporter = account(Role.USER); var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "MARKETPLACE", "ACTIVE");
        String reportPath = "/api/v1/listings/" + listing + "/reports";
        post(reporter, reportPath, Map.of("site", "PERSONALS", "reason", "SPAM")).andExpect(status().isNotFound());
        post(owner, reportPath, Map.of("site", "MARKETPLACE", "reason", "SPAM")).andExpect(status().isNotFound());
        String receipt = id(post(reporter, reportPath, Map.of("site", "MARKETPLACE", "reason", "SAFETY", "details", "Private report"))
                .andExpect(status().isOk()));
        assertThat(id(post(reporter, reportPath, Map.of("site", "MARKETPLACE", "reason", "SAFETY")).andExpect(status().isOk()))).isEqualTo(receipt);
        UUID review = review(listing); claim(moderator, review);
        // Save-count changes are not content edits and must not prevent urgent removal.
        jdbc.update("UPDATE listings SET save_count = save_count + 1, version = version + 1 WHERE id = ?", listing);
        post(moderator, path(review, "decisions"), Map.of("decision", "REMOVE", "reason", "UNSAFE_CONTENT"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.listingStatus").value("REMOVED"));
        mvc.perform(get("/api/v1/listings/" + listing + "?site=MARKETPLACE")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/moderation/cases/" + review).with(user(owner))).andExpect(status().isForbidden());
        assertThat(mvc.perform(get("/api/v1/sellers/" + owner.id() + "?site=MARKETPLACE")).andReturn().getResponse().getContentAsString())
                .doesNotContain(listing.toString());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reports WHERE listing_id = ?", Long.class, listing)).isEqualTo(1);
    }

    @Test void mediaBlocksAndForeignMediaCannotBeBypassed() throws Exception {
        var owner = account(Role.USER); var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "MARKETPLACE", "PENDING_REVIEW"); UUID review = review(listing); UUID media = media(listing);
        UUID foreign = media(listing(owner, "MARKETPLACE", "DRAFT")); claim(moderator, review);
        post(moderator, path(review, "media-reviews"), Map.of("mediaId", foreign, "verdict", "PASS")).andExpect(status().isConflict());
        post(moderator, path(review, "media-reviews"), Map.of("mediaId", media, "verdict", "BLOCK")).andExpect(status().isOk());
        post(moderator, path(review, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isConflict());
        assertThat(events(listing)).isZero();
        checkMedia(moderator, review, media);
        jdbc.update("UPDATE listing_media SET checksum_sha256 = ? WHERE id = ?", "b".repeat(64), media);
        post(moderator, path(review, "decisions"), Map.of("decision", "APPROVE")).andExpect(status().isConflict());
    }

    @Test void staffAssignmentsAndRoleRevocationsAreEnforcedFromDatabase() throws Exception {
        var owner = account(Role.USER); var first = account(Role.MODERATOR); var second = account(Role.MODERATOR); var admin = account(Role.ADMIN);
        UUID listing = listing(owner, "MARKETPLACE", "PENDING_REVIEW"); UUID review = review(listing);
        claim(first, review);
        post(second, path(review, "assignment"), Map.of("assigneeId", second.id())).andExpect(status().isConflict());
        post(first, path(review, "assignment"), Map.of("assigneeId", owner.id())).andExpect(status().isForbidden());
        post(admin, path(review, "assignment"), Map.of("assigneeId", second.id())).andExpect(status().isOk());
        post(first, path(review, "notes"), Map.of("message", "Cannot write this note")).andExpect(status().isConflict());
        jdbc.update("DELETE FROM user_roles WHERE user_id = ?", second.id());
        post(second, path(review, "decisions"), Map.of("decision", "REJECT", "reason", "UNSAFE_CONTENT")).andExpect(status().isForbidden());
    }

    @Test void auditHistoryRejectsMutationAndFailedDecisionLeavesNoSideEffects() throws Exception {
        var owner = account(Role.USER); var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "MARKETPLACE", "PENDING_REVIEW"); UUID review = review(listing); claim(moderator, review);
        long actions = jdbc.queryForObject("SELECT count(*) FROM moderation_actions WHERE case_id = ?", Long.class, review);
        post(moderator, path(review, "decisions"), Map.of("decision", "REMOVE", "reason", "UNSAFE_CONTENT")).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_actions WHERE case_id = ?", Long.class, review)).isEqualTo(actions);
        assertThat(events(listing)).isZero();
        assertThatThrownBy(() -> jdbc.update("UPDATE moderation_actions SET private_note = 'tamper' WHERE case_id = ?", review)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM audit_events WHERE subject_id = ?", listing)).isInstanceOf(DataAccessException.class);
    }

    @Test void concurrentReportsRespectQuotaAndDuplicatesAreIdempotent() throws Exception {
        var owner = account(Role.USER); var reporter = account(Role.USER);
        List<UUID> listings = java.util.stream.IntStream.range(0, 8).mapToObj(i -> listing(owner, "MARKETPLACE", "ACTIVE")).toList();
        try (var pool = Executors.newFixedThreadPool(8)) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Boolean>> futures = listings.stream().map(id -> pool.submit(() -> {
                start.await();
                try { service.report(reporter.id(), id, new Report(SiteScope.MARKETPLACE, ReportReason.SPAM, null)); return true; }
                catch (ModerationException e) { assertThat(e.status().value()).isEqualTo(429); return false; }
            })).toList();
            start.countDown();
            int successes = 0;
            for (var f : futures) if (f.get(20, TimeUnit.SECONDS)) successes++;
            assertThat(successes).isEqualTo(5);
        }
        UUID recorded = jdbc.queryForObject("SELECT listing_id FROM reports WHERE reporter_id = ? LIMIT 1", UUID.class, reporter.id());
        assertThat(service.report(reporter.id(), recorded, new Report(SiteScope.MARKETPLACE, ReportReason.SPAM, null)).id()).isNotNull();
        UUID newListing = listing(owner, "MARKETPLACE", "ACTIVE");
        post(reporter, "/api/v1/listings/" + newListing + "/reports", Map.of("site", "MARKETPLACE", "reason", "SPAM"))
                .andExpect(status().isTooManyRequests());
    }

    @Test void outboxFailureRollsBackPublicationAndAudit() throws Exception {
        var owner = account(Role.USER); var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "MARKETPLACE", "PENDING_REVIEW"); UUID review = review(listing);
        UUID media = media(listing); claim(moderator, review); checkMedia(moderator, review, media);
        long auditBefore = jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE subject_id = ?", Long.class, listing);
        jdbc.execute("ALTER TABLE listing_events ADD CONSTRAINT test_block_approval CHECK (event_type <> 'LISTING_APPROVED') NOT VALID");
        try {
            assertThatThrownBy(() -> service.decide(moderator.id(), review,
                    new ModerationRequests.DecisionRequest(cc.vezlist.moderation.domain.ModerationPolicy.Decision.APPROVE, null, null, false)))
                    .isInstanceOf(DataAccessException.class);
            assertThat(statusOf(listing)).isEqualTo("PENDING_REVIEW");
            assertThat(events(listing)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_actions WHERE case_id = ? AND action = 'APPROVE'", Long.class, review)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE subject_id = ?", Long.class, listing)).isEqualTo(auditBefore);
        } finally {
            jdbc.execute("ALTER TABLE listing_events DROP CONSTRAINT test_block_approval");
        }
    }

    @Test void invalidBodiesAndExpiredReportsReturnSafeClientErrors() throws Exception {
        var owner = account(Role.USER); var reporter = account(Role.USER);
        UUID listing = listing(owner, "MARKETPLACE", "ACTIVE");
        String path = "/api/v1/listings/" + listing + "/reports";
        post(reporter, path, Map.of("site", "UNKNOWN", "reason", "SPAM")).andExpect(status().isBadRequest());
        post(reporter, path, Map.of("site", "MARKETPLACE", "reason", "invented")).andExpect(status().isBadRequest());
        post(reporter, path, Map.of("site", "MARKETPLACE", "reason", "SPAM", "details", "x".repeat(1001))).andExpect(status().isBadRequest());
        jdbc.update("UPDATE listings SET expires_at = now() - interval '1 minute' WHERE id = ?", listing);
        post(reporter, path, Map.of("site", "MARKETPLACE", "reason", "SPAM")).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reports WHERE listing_id = ?", Long.class, listing)).isZero();
    }

    @Test void migrationUpgradesExistingPendingListingsWithoutLosingData() throws Exception {
        jdbc.execute("CREATE DATABASE moderation_upgrade");
        String upgradeUrl = "jdbc:postgresql://" + POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432) + "/moderation_upgrade";
        org.flywaydb.core.Flyway.configure().dataSource(upgradeUrl, POSTGRES.getUsername(), POSTGRES.getPassword())
                .target("10").load().migrate();
        UUID owner = UUID.randomUUID(); UUID listing = UUID.randomUUID();
        try (var connection = java.sql.DriverManager.getConnection(upgradeUrl, POSTGRES.getUsername(), POSTGRES.getPassword())) {
            try (var statement = connection.prepareStatement("INSERT INTO app_users(id, display_name, email, password_hash) VALUES (?, 'Existing member', 'upgrade@example.test', 'hash')")) {
                statement.setObject(1, owner); statement.executeUpdate();
            }
            try (var statement = connection.prepareStatement("""
                    INSERT INTO listings(id, owner_id, site_scope, status, title, business_name, description,
                        category_id, province_id, location_id, contact_email, contact_phone)
                    VALUES (?, ?, 'MARKETPLACE', 'PENDING_REVIEW', 'Existing listing', 'Business', 'Description',
                        'services', 'bc', 'bc-1', 'upgrade@example.test', '+12505550100')
                    """)) {
                statement.setObject(1, listing); statement.setObject(2, owner); statement.executeUpdate();
            }
        }
        org.flywaydb.core.Flyway.configure().dataSource(upgradeUrl, POSTGRES.getUsername(), POSTGRES.getPassword()).load().migrate();
        try (var connection = java.sql.DriverManager.getConnection(upgradeUrl, POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.prepareStatement("SELECT l.title, l.status, c.kind FROM listings l JOIN moderation_cases c ON c.listing_id = l.id WHERE l.id = ?")) {
            statement.setObject(1, listing);
            try (var result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                assertThat(result.getString("title")).isEqualTo("Existing listing");
                assertThat(result.getString("status")).isEqualTo("PENDING_REVIEW");
                assertThat(result.getString("kind")).isEqualTo("SUBMISSION");
                assertThat(result.next()).isFalse();
            }
        }
    }

    private VezlistUserPrincipal account(Role role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id, display_name, email, password_hash, enabled) VALUES (?, 'Test member', ?, 'hash', true)", id, id + "@example.test");
        jdbc.update("INSERT INTO user_roles(user_id, role) VALUES (?, ?)", id, role.name());
        return new VezlistUserPrincipal(id, "Test member", id + "@example.test", "hash", true, false, Set.of(role), Instant.now());
    }
    private UUID listing(VezlistUserPrincipal owner, String site, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings(id, owner_id, site_scope, status, title, business_name, description,
                    category_id, province_id, location_id, contact_email, contact_phone, submitted_at)
                VALUES (?, ?, ?, ?, 'Review this listing', 'Business', 'Listing description', ?, 'bc', 'bc-1',
                    'seller@example.test', '+12505550100', now())
                """, id, owner.id(), site, status, site.equals("PERSONALS") ? "personals" : "services");
        return id;
    }
    private UUID media(UUID listing) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listing_media(id, listing_id, object_key, original_filename, content_type, size_bytes,
                    checksum_sha256, status, position, upload_expires_at, ready_at)
                VALUES (?, ?, ?, 'photo.jpg', 'image/jpeg', 3, ?, 'READY', 0, now(), now())
                """, id, listing, "test/" + id + ".jpg", "a".repeat(64));
        return id;
    }
    private UUID review(UUID listing) { return jdbc.queryForObject("SELECT id FROM moderation_cases WHERE listing_id = ? AND status = 'OPEN'", UUID.class, listing); }
    private String statusOf(UUID listing) { return jdbc.queryForObject("SELECT status FROM listings WHERE id = ?", String.class, listing); }
    private long events(UUID listing) { return jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?", Long.class, listing); }
    private String path(UUID review, String suffix) { return "/api/v1/moderation/cases/" + review + "/" + suffix; }
    private ResultActions post(VezlistUserPrincipal actor, String path, Object body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path).with(user(actor)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)));
    }
    private void claim(VezlistUserPrincipal actor, UUID review) throws Exception { post(actor, path(review, "assignment"), Map.of("assigneeId", actor.id())).andExpect(status().isOk()); }
    private void checkMedia(VezlistUserPrincipal actor, UUID review, UUID media) throws Exception {
        post(actor, path(review, "media-reviews"), Map.of("mediaId", media, "verdict", "PASS")).andExpect(status().isOk());
    }
    private String id(ResultActions response) throws Exception { return json.readTree(response.andReturn().getResponse().getContentAsString()).get("id").asText(); }
}
