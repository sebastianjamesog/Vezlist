package cc.vezlist.listings.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;

import java.net.URI;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import cc.vezlist.media.storage.ObjectStorage;
import com.fasterxml.jackson.databind.ObjectMapper;

@Testcontainers
@Tag("integration")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ListingControllerIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private ObjectStorage storage;

    @LocalServerPort
    private int port;

    @BeforeEach
    void configureStorage() {
        given(storage.authorizeDownload(anyString()))
                .willAnswer(invocation -> URI.create("https://media.test/" + invocation.getArgument(0)));
    }

    @Test
    void registeredViewsPersistAndRefreshWithoutCountingDetailOrFeedReads() {
        Session owner = register("listing-views-" + UUID.randomUUID() + "@example.test");
        String activeId = createDraft(owner, "MARKETPLACE");
        String draftId = createDraft(owner, "MARKETPLACE");
        jdbc.update("UPDATE listings SET status = 'ACTIVE', published_at = now(), "
                + "expires_at = now() + interval '1 day' WHERE id = ?::uuid", activeId);
        String path = "/api/v1/listings/" + activeId;

        assertThat(rest.getForEntity(url(path + "?site=MARKETPLACE"), Map.class).getBody())
                .containsEntry("viewCount", 0);
        assertThat(rest.getForEntity(url("/api/v1/listings?site=MARKETPLACE"), Map.class).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("SELECT view_count FROM listings WHERE id = ?::uuid", Long.class, activeId))
                .isZero();

        String requestId = UUID.randomUUID().toString();
        ResponseEntity<Map> first = exchange(path + "/views?site=MARKETPLACE", HttpMethod.POST,
                null, owner, requestId, Map.class);
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(first.getBody()).containsExactlyEntriesOf(Map.of("viewCount", 1));
        assertThat(exchange(path + "/views?site=MARKETPLACE", HttpMethod.POST,
                null, owner, requestId, Map.class).getBody()).containsEntry("viewCount", 1);
        assertThat(exchange(path + "/views?site=MARKETPLACE", HttpMethod.POST,
                null, owner, UUID.randomUUID().toString(), Map.class).getBody())
                .containsEntry("viewCount", 2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_views WHERE listing_id = ?::uuid",
                Long.class, activeId)).isEqualTo(2);
        assertThat(rest.getForEntity(url(path + "?site=MARKETPLACE"), Map.class).getBody())
                .containsEntry("viewCount", 2);

        ResponseEntity<Map> counts = rest.getForEntity(url("/api/v1/listings/views?site=MARKETPLACE&ids="
                + activeId + "," + draftId), Map.class);
        assertThat(counts.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(counts.getBody()).containsExactlyEntriesOf(Map.of(activeId, 2));
        assertThat(rest.getForEntity(url("/api/v1/listings/views?site=PERSONALS&ids=" + activeId),
                Map.class).getBody()).isEmpty();
        assertThat(exchange("/api/v1/listings/" + draftId + "/views?site=MARKETPLACE",
                HttpMethod.POST, null, owner, UUID.randomUUID().toString(), Map.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void draftLifecycleIsOwnedScopedAndIdempotent() {
        Session owner = register("listing-owner-" + UUID.randomUUID() + "@example.test");
        Session other = register("listing-other-" + UUID.randomUUID() + "@example.test");
        Map<String, Object> request = validListing();

        ResponseEntity<Map> created = exchange(
                "/api/v1/listings", HttpMethod.POST, request, owner, "create-listing-1", Map.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(created.getBody()).containsEntry("status", "DRAFT").containsEntry("categoryId", "vehicles");
        String listingId = created.getBody().get("id").toString();

        ResponseEntity<Map> retried = exchange(
                "/api/v1/listings", HttpMethod.POST, request, owner, "create-listing-1", Map.class);
        assertThat(retried.getBody().get("id").toString()).isEqualTo(listingId);

        Map<String, Object> changedRequest = new java.util.HashMap<>(request);
        changedRequest.put("title", "A different request with the same key");
        ResponseEntity<Map> conflict = exchange(
                "/api/v1/listings", HttpMethod.POST, changedRequest, owner, "create-listing-1", Map.class);
        assertThat(conflict.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

        Map<String, Object> update = new java.util.HashMap<>(request);
        update.put("title", "Updated Honda Accord listing");
        ResponseEntity<Map> updated = exchange(
                "/api/v1/listings/" + listingId, HttpMethod.PATCH, update, owner, null, Map.class);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getBody()).containsEntry("title", "Updated Honda Accord listing");

        ResponseEntity<Map> hiddenFromPublic = rest.getForEntity(
                url("/api/v1/listings/" + listingId + "?site=MARKETPLACE"), Map.class);
        assertThat(hiddenFromPublic.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<Map> visibleToOwner = exchange(
                "/api/v1/listings/" + listingId + "?site=MARKETPLACE", HttpMethod.GET,
                null, owner, null, Map.class);
        assertThat(visibleToOwner.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Map> hiddenFromOther = exchange(
                "/api/v1/listings/" + listingId + "?site=MARKETPLACE", HttpMethod.GET,
                null, other, null, Map.class);
        assertThat(hiddenFromOther.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<Map> incompleteSubmit = exchange(
                "/api/v1/listings/" + listingId + "/submit", HttpMethod.POST, null,
                owner, "submit-without-media", Map.class);
        assertThat(incompleteSubmit.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        addReadyImage(listingId);

        ResponseEntity<Map> otherSubmit = exchange(
                "/api/v1/listings/" + listingId + "/submit", HttpMethod.POST, null,
                other, "submit-not-owner", Map.class);
        assertThat(otherSubmit.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<Map> submitted = exchange(
                "/api/v1/listings/" + listingId + "/submit", HttpMethod.POST, null,
                owner, "submit-listing-1", Map.class);
        assertThat(submitted.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(submitted.getBody()).containsEntry("status", "ACTIVE").containsEntry("verificationRequested", false);

        ResponseEntity<Map> submitRetry = exchange(
                "/api/v1/listings/" + listingId + "/submit", HttpMethod.POST, null,
                owner, "submit-listing-1", Map.class);
        assertThat(submitRetry.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(submitRetry.getBody()).containsEntry("status", "ACTIVE");

        ResponseEntity<List> mine = exchange(
                "/api/v1/me/listings?site=MARKETPLACE", HttpMethod.GET, null, owner, null, List.class);
        assertThat(mine.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(mine.getBody()).hasSize(1);

        Map<String, Object> personalsRequest = new java.util.HashMap<>(request);
        personalsRequest.put("site", "PERSONALS");
        personalsRequest.put("categoryId", "personals");
        ResponseEntity<Map> personals = exchange(
                "/api/v1/listings", HttpMethod.POST, personalsRequest,
                owner, "create-personals-1", Map.class);
        assertThat(personals.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        ResponseEntity<List> scopedMarketplace = exchange(
                "/api/v1/me/listings?site=MARKETPLACE", HttpMethod.GET, null, owner, null, List.class);
        ResponseEntity<List> scopedPersonals = exchange(
                "/api/v1/me/listings?site=PERSONALS", HttpMethod.GET, null, owner, null, List.class);
        assertThat(scopedMarketplace.getBody()).hasSize(1);
        assertThat(scopedPersonals.getBody()).hasSize(1);

        ResponseEntity<Map> otherDelete = exchange(
                "/api/v1/listings/" + listingId, HttpMethod.DELETE, null, other, null, Map.class);
        assertThat(otherDelete.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<Void> deleted = exchange(
                "/api/v1/listings/" + listingId, HttpMethod.DELETE, null, owner, null, Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<Map> afterDelete = exchange(
                "/api/v1/listings/" + listingId + "?site=MARKETPLACE", HttpMethod.GET,
                null, owner, null, Map.class);
        assertThat(afterDelete.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<List> afterDeleteMine = exchange(
                "/api/v1/me/listings?site=MARKETPLACE", HttpMethod.GET, null, owner, null, List.class);
        assertThat(afterDeleteMine.getBody()).isEmpty();
    }

    @Test
    void invalidCrossSiteCategoryAndLocationPairAreRejected() {
        Session owner = register("listing-validation-" + UUID.randomUUID() + "@example.test");

        Map<String, Object> missingTitle = new java.util.HashMap<>(validListing());
        missingTitle.remove("title");
        ResponseEntity<Map> missingTitleResponse = exchange(
                "/api/v1/listings", HttpMethod.POST, missingTitle, owner, "missing-title", Map.class);
        assertThat(missingTitleResponse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(missingTitleResponse.getBody()).containsEntry("code", "VALIDATION_ERROR");

        ResponseEntity<Map> missingIdempotencyKey = exchange(
                "/api/v1/listings", HttpMethod.POST, validListing(), owner, null, Map.class);
        assertThat(missingIdempotencyKey.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(missingIdempotencyKey.getBody()).containsEntry("code", "VALIDATION_ERROR");

        Map<String, Object> wrongCategory = new java.util.HashMap<>(validListing());
        wrongCategory.put("site", "PERSONALS");
        ResponseEntity<Map> categoryResponse = exchange(
                "/api/v1/listings", HttpMethod.POST, wrongCategory, owner, "wrong-category", Map.class);
        assertThat(categoryResponse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(categoryResponse.getBody()).containsEntry("code", "CATALOG_REFERENCE_INVALID");

        Map<String, Object> wrongLocation = new java.util.HashMap<>(validListing());
        wrongLocation.put("provinceId", "on");
        wrongLocation.put("locationId", "bc-1");
        ResponseEntity<Map> locationResponse = exchange(
                "/api/v1/listings", HttpMethod.POST, wrongLocation, owner, "wrong-location", Map.class);
        assertThat(locationResponse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(locationResponse.getBody()).containsEntry("code", "CATALOG_REFERENCE_INVALID");
    }

    @ParameterizedTest
    @ValueSource(strings = {"MARKETPLACE", "PERSONALS"})
    void regularSubmissionsPublishImmediatelyWithoutStaffApproval(String site) {
        Session owner = register("publish-" + UUID.randomUUID() + "@example.test");
        String id = createDraft(owner, site);
        addReadyImage(id);

        ResponseEntity<Map> response = exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                Map.of("requestVerification", false), owner, "publish", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "ACTIVE")
                .containsEntry("verificationRequested", false).containsEntry("verified", false);
        assertThat(response.getBody().get("submittedAt")).isNotNull();
        Instant published = Instant.parse(response.getBody().get("publishedAt").toString());
        Instant expires = Instant.parse(response.getBody().get("expiresAt").toString());
        assertThat(Duration.between(published, expires)).isEqualTo(Duration.ofDays(30));
        assertThat(rest.getForEntity(url("/api/v1/listings/" + id + "?site=" + site), Map.class).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        String oppositeSite = site.equals("MARKETPLACE") ? "PERSONALS" : "MARKETPLACE";
        assertThat(rest.getForEntity(url("/api/v1/listings/" + id + "?site=" + oppositeSite), Map.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_cases WHERE listing_id = ?::uuid", Long.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?::uuid AND event_type = 'LISTING_PUBLISHED'", Long.class, id)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_events WHERE subject_id = ?::uuid AND event_type = 'LISTING_APPROVED'", Long.class, id)).isZero();

        ResponseEntity<Map> retry = exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                null, owner, "publish", Map.class);
        assertThat(retry.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(retry.getBody().get("publishedAt")).isEqualTo(response.getBody().get("publishedAt"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?::uuid AND event_type = 'LISTING_PUBLISHED'", Long.class, id)).isEqualTo(1L);
        assertThat(exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                Map.of("requestVerification", true), owner, "publish", Map.class).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @ParameterizedTest
    @ValueSource(strings = {"MARKETPLACE", "PERSONALS"})
    void verificationSubmissionsRemainPrivateAndOutsideOrdinaryModeration(String site) {
        Session owner = register("verify-submit-" + UUID.randomUUID() + "@example.test");
        String id = createDraft(owner, site);
        addReadyImage(id);

        ResponseEntity<Map> response = exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                Map.of("requestVerification", true), owner, "verify-submit", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "PENDING_REVIEW")
                .containsEntry("verificationRequested", true).containsEntry("verified", false)
                .containsEntry("publishedAt", null).containsEntry("expiresAt", null);
        assertThat(rest.getForEntity(url("/api/v1/listings/" + id + "?site=" + site), Map.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_cases WHERE listing_id = ?::uuid", Long.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?::uuid AND event_type = 'LISTING_SUBMITTED'", Long.class, id)).isEqualTo(1L);

        ResponseEntity<Map> retry = exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                Map.of("requestVerification", true), owner, "verify-submit", Map.class);
        assertThat(retry.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(retry.getBody()).containsEntry("status", "PENDING_REVIEW");
        assertThat(retry.getBody().get("submittedAt")).isEqualTo(response.getBody().get("submittedAt"));
        assertThat(exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                null, owner, "verify-submit", Map.class).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                Map.of("requestVerification", false), owner, "another-key", Map.class).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @ParameterizedTest
    @ValueSource(strings = {"category", "area", "province"})
    void submissionRevalidatesCatalogBeforePublishing(String disabled) {
        Session owner = register("disabled-catalog-" + UUID.randomUUID() + "@example.test");
        String id = createDraft(owner, "MARKETPLACE");
        addReadyImage(id);
        String table = disabled.equals("category") ? "categories" : "locations";
        String catalogId = disabled.equals("category") ? "vehicles" : disabled.equals("area") ? "bc-1" : "bc";
        jdbc.update("UPDATE " + table + " SET enabled = false WHERE id = ?", catalogId);
        try {
            ResponseEntity<Map> response = exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                    null, owner, "disabled-catalog", Map.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody()).containsEntry("code", "CATALOG_REFERENCE_INVALID");
            assertThat(jdbc.queryForObject("SELECT status FROM listings WHERE id = ?::uuid", String.class, id)).isEqualTo("DRAFT");
        } finally {
            jdbc.update("UPDATE " + table + " SET enabled = true WHERE id = ?", catalogId);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"UPLOADING", "PROCESSING", "REJECTED"})
    void submissionRequiresEveryImageToBeReady(String status) {
        Session owner = register("media-not-ready-" + UUID.randomUUID() + "@example.test");
        String id = createDraft(owner, "MARKETPLACE");
        addReadyImage(id);
        addImage(id, status, 1);
        ResponseEntity<Map> response = exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                null, owner, "not-ready", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).containsEntry("code", "MEDIA_VALIDATION_ERROR");
        assertThat(jdbc.queryForObject("SELECT status FROM listings WHERE id = ?::uuid", String.class, id)).isEqualTo("DRAFT");
    }

    @Test
    void legacyNoBodyIdempotencyRetryDoesNotPublishAnExistingPendingListing() throws Exception {
        Session owner = register("legacy-submit-" + UUID.randomUUID() + "@example.test");
        String id = createDraft(owner, "MARKETPLACE");
        addReadyImage(id);
        jdbc.update("UPDATE listings SET status = 'PENDING_REVIEW', submitted_at = now(), version = version + 1 WHERE id = ?::uuid", id);
        String legacyFingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(new ObjectMapper().writeValueAsBytes(id)));
        jdbc.update("""
                INSERT INTO listing_idempotency_keys(id, owner_id, operation, idempotency_key, request_fingerprint, listing_id)
                SELECT gen_random_uuid(), owner_id, 'SUBMIT', 'legacy-submit', ?, id FROM listings WHERE id = ?::uuid
                """, legacyFingerprint, id);

        ResponseEntity<Map> response = exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                null, owner, "legacy-submit", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "PENDING_REVIEW")
                .containsEntry("verificationRequested", false).containsEntry("publishedAt", null);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_cases WHERE listing_id = ?::uuid AND kind = 'SUBMISSION' AND status = 'OPEN'", Long.class, id)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?::uuid AND event_type = 'LISTING_PUBLISHED'", Long.class, id)).isZero();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void rejectedVerificationResubmissionClearsTheOldAppealAndRespectsTheNewMode(boolean requestVerification) {
        Session owner = register("resubmit-" + UUID.randomUUID() + "@example.test");
        String id = createDraft(owner, "MARKETPLACE");
        addReadyImage(id);
        jdbc.update("UPDATE listings SET status = 'REJECTED', verification_requested = true, moderation_reason = 'ELIGIBILITY_NOT_CONFIRMED' WHERE id = ?::uuid", id);
        jdbc.update("INSERT INTO moderation_cases(listing_id, kind, review_version) VALUES (?::uuid, 'APPEAL', 0)", id);
        ResponseEntity<Map> response = exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                Map.of("requestVerification", requestVerification), owner, "resubmit", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", requestVerification ? "PENDING_REVIEW" : "ACTIVE")
                .containsEntry("verificationRequested", requestVerification).containsEntry("verified", false);
        assertThat(response.getBody().get("publishedAt") != null).isEqualTo(!requestVerification);
        assertThat(jdbc.queryForObject("SELECT moderation_reason FROM listings WHERE id = ?::uuid", String.class, id)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_cases WHERE listing_id = ?::uuid AND status = 'OPEN'", Long.class, id)).isZero();
    }

    @Test
    void publishingTriggerPreservesReportCasesOnActiveMetadataUpdates() {
        Session owner = register("report-case-" + UUID.randomUUID() + "@example.test");
        String id = createDraft(owner, "MARKETPLACE");
        addReadyImage(id);
        assertThat(exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                null, owner, "publish", Map.class).getStatusCode()).isEqualTo(HttpStatus.OK);
        jdbc.update("INSERT INTO moderation_cases(listing_id, kind, review_version) SELECT id, 'REPORT', version FROM listings WHERE id = ?::uuid", id);
        jdbc.update("UPDATE listings SET status = 'ACTIVE', save_count = save_count + 1, version = version + 1 WHERE id = ?::uuid", id);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_cases WHERE listing_id = ?::uuid AND kind = 'REPORT' AND status = 'OPEN'", Long.class, id)).isEqualTo(1L);
    }

    @Test
    void concurrentSubmitRetriesPublishOnlyOnce() throws Exception {
        Session owner = register("concurrent-submit-" + UUID.randomUUID() + "@example.test");
        String id = createDraft(owner, "MARKETPLACE");
        addReadyImage(id);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<ResponseEntity<Map>>> requests = java.util.stream.IntStream.range(0, 2)
                    .mapToObj(ignored -> executor.submit(() -> {
                        start.await();
                        return exchange("/api/v1/listings/" + id + "/submit", HttpMethod.POST,
                                null, owner, "concurrent-publish", Map.class);
                    })).toList();
            start.countDown();
            for (Future<ResponseEntity<Map>> request : requests) {
                ResponseEntity<Map> response = request.get(20, TimeUnit.SECONDS);
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(response.getBody()).containsEntry("status", "ACTIVE");
            }
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?::uuid AND event_type = 'LISTING_PUBLISHED'", Long.class, id)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_idempotency_keys WHERE listing_id = ?::uuid AND operation = 'SUBMIT'", Long.class, id)).isEqualTo(1L);
    }

    @Test
    void browserPreflightAllowsTheIdempotencyHeader() {
        HttpHeaders headers = new HttpHeaders();
        headers.setOrigin("http://localhost:3000");
        headers.set(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST");
        headers.set(
                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                "Content-Type, Idempotency-Key, X-XSRF-TOKEN");

        ResponseEntity<Void> response = rest.exchange(
                url("/api/v1/listings"), HttpMethod.OPTIONS,
                new HttpEntity<>(null, headers), Void.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getAccessControlAllowHeaders())
                .contains("Idempotency-Key", "X-XSRF-TOKEN");
    }

    @Test
    void profileSummaryCountsOnlyThisOwnersUnexpiredActiveAdsOnTheRequestedSite() {
        Session owner = register("summary-owner-" + UUID.randomUUID() + "@example.test");
        Session other = register("summary-other-" + UUID.randomUUID() + "@example.test");
        assertActiveCount(owner, "MARKETPLACE", 0);

        String future = createDraft(owner, "MARKETPLACE");
        String legacyWithoutExpiry = createDraft(owner, "MARKETPLACE");
        String expiredActive = createDraft(owner, "MARKETPLACE");
        String personals = createDraft(owner, "PERSONALS");
        String someoneElses = createDraft(other, "MARKETPLACE");
        for (String id : List.of(future, legacyWithoutExpiry, expiredActive, personals, someoneElses)) {
            jdbc.update("UPDATE listings SET status = 'ACTIVE', published_at = now(), expires_at = now() + interval '1 day' WHERE id = ?::uuid", id);
        }
        jdbc.update("UPDATE listings SET expires_at = null WHERE id = ?::uuid", legacyWithoutExpiry);
        jdbc.update("UPDATE listings SET expires_at = now() - interval '1 second' WHERE id = ?::uuid", expiredActive);
        for (String status : List.of("DRAFT", "PENDING_REVIEW", "REJECTED", "REMOVED", "EXPIRED", "DELETED")) {
            String id = createDraft(owner, "MARKETPLACE");
            jdbc.update("UPDATE listings SET status = ? WHERE id = ?::uuid", status, id);
        }

        assertActiveCount(owner, "MARKETPLACE", 2);
        assertActiveCount(owner, "PERSONALS", 1);
        assertActiveCount(other, "MARKETPLACE", 1);
        assertActiveCount(other, "PERSONALS", 0);

        // Query parameters cannot select another account: ownership is always the session principal.
        String otherOwnerId = jdbc.queryForObject("SELECT owner_id::text FROM listings WHERE id = ?::uuid", String.class, someoneElses);
        ResponseEntity<Map> spoofedOwner = exchange(
                "/api/v1/me/listings/summary?site=MARKETPLACE&ownerId=" + otherOwnerId,
                HttpMethod.GET, null, owner, null, Map.class);
        assertThat(spoofedOwner.getBody()).containsEntry("activeAds", 2);
    }

    @Test
    void profileSummaryRequiresAuthenticationAndAValidSite() {
        assertThat(rest.getForEntity(url("/api/v1/me/listings/summary?site=MARKETPLACE"), Map.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        Session owner = register("summary-validation-" + UUID.randomUUID() + "@example.test");
        for (String query : List.of("", "?site=UNKNOWN")) {
            assertThat(exchange("/api/v1/me/listings/summary" + query, HttpMethod.GET, null, owner, null, Map.class).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }
    }

    @Test
    void explicitlySharedAdLocationMakesAdsDiscoverableAndCanBeRevoked() {
        Session owner = register("geo-owner-" + UUID.randomUUID() + "@example.test");
        Session other = register("geo-other-" + UUID.randomUUID() + "@example.test");
        String existing = createDraft(owner, "MARKETPLACE");
        String unrelated = createDraft(other, "MARKETPLACE");
        var saved = exchange("/api/v1/me/ad-location", HttpMethod.PATCH,
                Map.of("latitude", 48.4284, "longitude", -123.3656), owner, null, Map.class);
        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(saved.getBody()).containsEntry("preciseLocation", true).containsEntry("adLocationSet", true);
        String future = createDraft(owner, "MARKETPLACE");
        for (String id : List.of(existing, future)) {
            assertThat(jdbc.queryForObject("SELECT latitude FROM listings WHERE id=?::uuid", Double.class, id)).isEqualTo(48.4284);
            jdbc.update("UPDATE listings SET status='ACTIVE', published_at=now() WHERE id=?::uuid", id);
        }
        assertThat(jdbc.queryForObject("SELECT latitude FROM listings WHERE id=?::uuid", Double.class, unrelated)).isNull();
        var nearby = rest.getForEntity(url("/api/v1/listings?site=MARKETPLACE&sort=NEAREST&latitude=48.4284&longitude=-123.3656&radiusKm=5"), Map.class);
        assertThat(nearby.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map> cards = (List<Map>) nearby.getBody().get("items");
        assertThat(cards).extracting(card -> card.get("id")).contains(existing, future);
        var disabled = exchange("/api/v1/me/preferences", HttpMethod.PATCH,
                Map.of("pushNotifications", true, "emailUpdates", false, "showPhoneOnAds", true, "preciseLocation", false), owner, null, Map.class);
        assertThat(disabled.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(disabled.getBody()).containsEntry("adLocationSet", false);
        for (String id : List.of(existing, future)) {
            assertThat(jdbc.queryForObject("SELECT latitude FROM listings WHERE id=?::uuid", Double.class, id)).isNull();
            assertThat(jdbc.queryForObject("SELECT coordinates IS NULL FROM listings WHERE id=?::uuid", Boolean.class, id)).isTrue();
        }
        Map<String, Object> staleEdit = new java.util.HashMap<>(validListing());
        staleEdit.put("latitude", 48.4284);
        staleEdit.put("longitude", -123.3656);
        assertThat(exchange("/api/v1/listings/" + existing, HttpMethod.PATCH, staleEdit, owner, null, Map.class)
                .getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("SELECT coordinates IS NULL FROM listings WHERE id=?::uuid", Boolean.class, existing)).isTrue();
        assertThat(exchange("/api/v1/me/ad-location", HttpMethod.PATCH,
                Map.of("latitude", 100, "longitude", -123), owner, null, Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private void assertActiveCount(Session owner, String site, int expected) {
        ResponseEntity<Map> summary = exchange(
                "/api/v1/me/listings/summary?site=" + site, HttpMethod.GET, null, owner, null, Map.class);
        assertThat(summary.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(summary.getBody()).containsExactlyEntriesOf(Map.of("activeAds", expected));
    }

    @Test
    void activeDetailEditsKeepPublicationAndExpiryAndRankWhileModeratedAdsRemainLocked() {
        Session owner = register("edit-position-" + UUID.randomUUID() + "@example.test");
        Session other = register("edit-other-" + UUID.randomUUID() + "@example.test");
        String older = createDraft(owner, "MARKETPLACE");
        String newer = createDraft(other, "MARKETPLACE");
        jdbc.update("UPDATE listings SET status='ACTIVE', published_at=now() - interval '1 minute', expires_at=now() + interval '2 days' WHERE id=?::uuid", older);
        jdbc.update("UPDATE listings SET status='ACTIVE', published_at=now(), expires_at=now() + interval '2 days' WHERE id=?::uuid", newer);
        var before = jdbc.queryForMap("SELECT published_at, expires_at FROM listings WHERE id=?::uuid", older);
        Map<String, Object> changes = new java.util.HashMap<>(validListing());
        changes.put("title", "Updated without bumping this ad");
        assertThat(exchange("/api/v1/listings/" + older, HttpMethod.PATCH, changes, other, null, Map.class)
                .getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        var updated = exchange("/api/v1/listings/" + older, HttpMethod.PATCH, changes, owner, null, Map.class);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getBody()).containsEntry("status", "ACTIVE");
        assertThat(jdbc.queryForMap("SELECT published_at, expires_at FROM listings WHERE id=?::uuid", older)).isEqualTo(before);
        var owned = exchange("/api/v1/me/listings?site=MARKETPLACE", HttpMethod.GET, null, owner, null, List.class);
        Map row = (Map) owned.getBody().stream().filter(item -> ((Map)item).get("id").equals(older)).findFirst().orElseThrow();
        long expected = jdbc.queryForObject("SELECT count(*) FROM listings l JOIN app_users u ON u.id=l.owner_id AND u.enabled=true WHERE l.site_scope='MARKETPLACE' AND l.category_id='vehicles' AND l.location_id='bc-1' AND l.status='ACTIVE' AND (l.expires_at IS NULL OR l.expires_at>now()) AND (coalesce(l.published_at,l.created_at),l.id)>=(SELECT coalesce(published_at,created_at),id FROM listings WHERE id=?::uuid)", Long.class, older);
        assertThat(((Number)row.get("currentPosition")).longValue()).isEqualTo(expected);
        for (String status : List.of("PENDING_REVIEW", "REMOVED")) {
            jdbc.update("UPDATE listings SET status=? WHERE id=?::uuid", status, older);
            assertThat(exchange("/api/v1/listings/" + older, HttpMethod.PATCH, changes, owner, null, Map.class)
                    .getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"MARKETPLACE", "PERSONALS"})
    void postingRankUsesTheWholePersonalsBoardButScopesMarketplaceByCategoryAndArea(String site) {
        Session owner = register("rank-owner-" + UUID.randomUUID() + "@example.test");
        Session other = register("rank-other-" + UUID.randomUUID() + "@example.test");
        Session disabled = register("rank-disabled-" + UUID.randomUUID() + "@example.test");
        String category = rankCategory(site);
        String area = rankArea();
        Instant firstPosted = nextRankPublication(site);
        Instant laterPosted = firstPosted.plusSeconds(60);
        String first = rankListing(owner, site, category, area, firstPosted, "ACTIVE");
        assertPostingRank(owner, site, first, 1);

        // Only Marketplace excludes another category or area from the posting rank.
        if (site.equals("MARKETPLACE")) {
            rankListing(other, site, rankCategory(site), area, laterPosted, "ACTIVE");
            rankListing(other, site, category, rankArea(), laterPosted, "ACTIVE");
        }
        String otherSite = site.equals("MARKETPLACE") ? "PERSONALS" : "MARKETPLACE";
        rankListing(other, otherSite, rankCategory(otherSite), area, laterPosted, "ACTIVE");
        for (String status : List.of("DRAFT", "PENDING_REVIEW", "REJECTED", "EXPIRED", "REMOVED", "DELETED")) {
            rankListing(other, site, category, area, laterPosted, status);
        }
        String expiredActive = rankListing(other, site, category, area, laterPosted, "ACTIVE");
        jdbc.update("UPDATE listings SET expires_at=? WHERE id=?::uuid",
                java.sql.Timestamp.from(Instant.now().minusSeconds(60)), expiredActive);
        String disabledOwnerAd = rankListing(disabled, site, category, area, laterPosted, "ACTIVE");
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=(SELECT owner_id FROM listings WHERE id=?::uuid)",
                disabledOwnerAd);
        assertPostingRank(owner, site, first, 1);

        // A Personals post competes even when both its category and location differ.
        String nextCategory = site.equals("PERSONALS") ? rankCategory(site) : category;
        String nextArea = site.equals("PERSONALS") ? rankArea() : area;
        String next = rankListing(other, site, nextCategory, nextArea, laterPosted, "ACTIVE");
        assertPostingRank(owner, site, first, 2);
        assertPostingRank(other, site, next, 1);
        jdbc.update("UPDATE listings SET view_count=1000000 WHERE id=?::uuid", first);
        assertPostingRank(owner, site, first, 2);
        assertPostingRank(other, site, next, 1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"MARKETPLACE", "PERSONALS"})
    void myAdsStayInPostingOrderAfterAnOlderAdIsEditedOrGetsMoreViews(String site) {
        Session owner = register("my-ad-order-" + UUID.randomUUID() + "@example.test");
        String category = rankCategory(site);
        String area = rankArea();
        Instant firstPosted = nextRankPublication(site);
        String older = rankListing(owner, site, category, area, firstPosted, "ACTIVE");
        String newer = rankListing(owner, site, category, area, firstPosted.plusSeconds(60), "ACTIVE");
        assertThat(ownedRows(owner, site)).extracting(row -> row.get("id")).containsExactly(newer, older);
        Map<String, Object> datesBefore = jdbc.queryForMap(
                "SELECT published_at, expires_at FROM listings WHERE id=?::uuid", older);

        Map<String, Object> edit = rankRequest(site, category, area);
        edit.put("title", "An older ad edited without changing its posting order");
        ResponseEntity<Map> edited = exchange("/api/v1/listings/" + older, HttpMethod.PATCH,
                edit, owner, null, Map.class);
        assertThat(edited.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("SELECT a.updated_at > b.updated_at FROM listings a, listings b "
                + "WHERE a.id=?::uuid AND b.id=?::uuid", Boolean.class, older, newer)).isTrue();
        assertThat(jdbc.queryForMap("SELECT published_at, expires_at FROM listings WHERE id=?::uuid", older))
                .isEqualTo(datesBefore);
        jdbc.update("UPDATE listings SET view_count=1000000 WHERE id=?::uuid", older);
        assertThat(ownedRows(owner, site)).extracting(row -> row.get("id")).containsExactly(newer, older);
        assertPostingRank(owner, site, newer, 1);
        assertPostingRank(owner, site, older, 2);
    }

    private Instant nextRankPublication(String site) {
        // Personals now ranks the entire board. Choose explicit test publication times
        // above earlier fixtures instead of depending on test order or clearing others' rows.
        return jdbc.queryForObject("SELECT greatest(now(), coalesce(max(coalesce(published_at, created_at)), now())) "
                        + "FROM listings WHERE site_scope=?", java.sql.Timestamp.class, site)
                .toInstant().plusSeconds(60);
    }

    private String rankCategory(String site) {
        String id = "rank-" + UUID.randomUUID();
        jdbc.update("INSERT INTO categories(id,label,icon,site_scope,display_order) VALUES (?, 'Rank test', 'Tag', ?, 999)", id, site);
        return id;
    }

    private String rankArea() {
        String id = "rank-" + UUID.randomUUID().toString().replace("-", "");
        jdbc.update("INSERT INTO locations(id,parent_id,label,location_type,display_order) VALUES (?, 'bc', 'Rank test area', 'AREA', 999)", id);
        return id;
    }

    private Map<String, Object> rankRequest(String site, String category, String area) {
        Map<String, Object> request = new java.util.HashMap<>(validListing());
        request.put("site", site);
        request.put("categoryId", category);
        request.put("locationId", area);
        return request;
    }

    private String rankListing(Session owner, String site, String category, String area,
            Instant published, String status) {
        ResponseEntity<Map> response = exchange("/api/v1/listings", HttpMethod.POST,
                rankRequest(site, category, area), owner, "rank-" + UUID.randomUUID(), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String id = response.getBody().get("id").toString();
        jdbc.update("UPDATE listings SET status=?, created_at=?, published_at=?, updated_at=?, "
                        + "expires_at=now()+interval '2 days' WHERE id=?::uuid",
                status, java.sql.Timestamp.from(published.minusSeconds(60)), java.sql.Timestamp.from(published),
                java.sql.Timestamp.from(Instant.now().minusSeconds(120)), id);
        return id;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> ownedRows(Session owner, String site) {
        ResponseEntity<List> response = exchange("/api/v1/me/listings?site=" + site,
                HttpMethod.GET, null, owner, null, List.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return (List<Map<String, Object>>) response.getBody();
    }

    private void assertPostingRank(Session owner, String site, String listingId, int expected) {
        Map<String, Object> row = ownedRows(owner, site).stream()
                .filter(item -> listingId.equals(item.get("id"))).findFirst().orElseThrow();
        assertThat(row.get("currentPosition")).isEqualTo(expected);
    }

    private Map<String, Object> validListing() {
        return Map.ofEntries(
                Map.entry("site", "MARKETPLACE"),
                Map.entry("title", "2012 Honda Accord EX-L"),
                Map.entry("businessName", "Test Seller"),
                Map.entry("description", "A complete, carefully maintained vehicle listing."),
                Map.entry("price", 9250),
                Map.entry("categoryId", "vehicles"),
                Map.entry("provinceId", "bc"),
                Map.entry("locationId", "bc-1"),
                Map.entry("contactEmail", "seller@example.test"),
                Map.entry("contactPhone", "+1 250 555 0100"),
                Map.entry("attributes", Map.of("condition", "Used")));
    }

    private void addReadyImage(String listingId) {
        addImage(listingId, "READY", 0);
    }

    private void addImage(String listingId, String status, int position) {
        UUID mediaId = UUID.randomUUID();
        jdbc.update("""
                insert into listing_media (
                    id, listing_id, object_key, original_filename, content_type,
                    size_bytes, checksum_sha256, status, position, upload_expires_at, ready_at
                ) values (?, ?::uuid, ?, ?, ?, ?, ?, ?, ?, now() + interval '10 minutes', now())
                """,
                mediaId,
                listingId,
                "marketplace/listings/" + listingId + "/" + mediaId + ".jpg",
                "test.jpg",
                "image/jpeg",
                3,
                "a".repeat(64), status, position);
    }

    private String createDraft(Session owner, String site) {
        Map<String, Object> request = new java.util.HashMap<>(validListing());
        request.put("site", site);
        request.put("categoryId", site.equals("PERSONALS") ? "personals" : "vehicles");
        ResponseEntity<Map> response = exchange("/api/v1/listings", HttpMethod.POST,
                request, owner, "create-" + UUID.randomUUID(), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getBody().get("id").toString();
    }

    private Session register(String email) {
        ResponseEntity<Map> csrf = rest.getForEntity(url("/api/v1/auth/csrf"), Map.class);
        String token = (String) csrf.getBody().get("token");
        String header = (String) csrf.getBody().get("headerName");
        String csrfCookies = cookies(csrf.getHeaders());
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(Map.of(
                "name", "Listing Test User",
                "email", email,
                "password", "SafeTestPass123!",
                "acceptedTerms", true), headers(header, token, csrfCookies, null));
        ResponseEntity<Map> registration = rest.postForEntity(url("/api/v1/auth/register"), request, Map.class);
        assertThat(registration.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String authenticatedCookies = mergeCookies(csrfCookies, cookies(registration.getHeaders()));
        HttpHeaders csrfHeaders = new HttpHeaders();
        csrfHeaders.set(HttpHeaders.COOKIE, authenticatedCookies);
        ResponseEntity<Map> authenticatedCsrf = rest.exchange(url("/api/v1/auth/csrf"), HttpMethod.GET,
                new HttpEntity<>(csrfHeaders), Map.class);
        assertThat(authenticatedCsrf.getStatusCode()).isEqualTo(HttpStatus.OK);
        header = (String) authenticatedCsrf.getBody().get("headerName");
        token = (String) authenticatedCsrf.getBody().get("token");
        authenticatedCookies = mergeCookies(authenticatedCookies, cookies(authenticatedCsrf.getHeaders()));
        return new Session(header, token, authenticatedCookies);
    }

    private <T> ResponseEntity<T> exchange(
            String path, HttpMethod method, Object body, Session session, String idempotencyKey,
            Class<T> responseType) {
        HttpHeaders headers = headers(
                session.csrfHeader(), session.csrfToken(), session.cookies(), idempotencyKey);
        return rest.exchange(url(path), method, new HttpEntity<>(body, headers), responseType);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private HttpHeaders headers(String csrfHeader, String csrfToken, String cookies, String idempotencyKey) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, cookies);
        headers.set(csrfHeader, csrfToken);
        if (idempotencyKey != null) headers.set("Idempotency-Key", idempotencyKey);
        return headers;
    }

    private String cookies(HttpHeaders headers) {
        return headers.getOrEmpty(HttpHeaders.SET_COOKIE).stream()
                .map(cookie -> cookie.substring(0, cookie.indexOf(';')))
                .collect(Collectors.joining("; "));
    }

    private String mergeCookies(String... cookieHeaders) {
        Map<String, String> jar = new java.util.LinkedHashMap<>();
        for (String header : cookieHeaders) {
            if (header == null || header.isBlank()) continue;
            for (String pair : header.split("; ")) {
                int equals = pair.indexOf('=');
                String name = pair.substring(0, equals);
                String value = pair.substring(equals + 1);
                if (value.isBlank()) jar.remove(name);
                else jar.put(name, value);
            }
        }
        return jar.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("; "));
    }

    private record Session(String csrfHeader, String csrfToken, String cookies) {
    }
}
