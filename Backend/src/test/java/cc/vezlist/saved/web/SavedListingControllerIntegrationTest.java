package cc.vezlist.saved.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;

import java.net.URI;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

import cc.vezlist.media.storage.ObjectStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
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

@Testcontainers
@Tag("integration")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SavedListingControllerIntegrationTest {

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
    void resetListings() {
        jdbc.update("DELETE FROM saved_listings");
        jdbc.update("DELETE FROM listing_media");
        jdbc.update("DELETE FROM listing_events");
        jdbc.update("DELETE FROM listings");
        given(storage.authorizeDownload(anyString()))
                .willAnswer(invocation -> URI.create("https://media.test/" + invocation.getArgument(0)));
    }

    @Test
    void saveStateFeedAndUnsaveAreAuthenticatedIdempotentAndPrivate() {
        Session saver = register("saved-primary-" + UUID.randomUUID() + "@example.test");
        Session other = register("saved-other-" + UUID.randomUUID() + "@example.test");
        UUID seller = user(true, true);
        UUID listing = listing(seller, "MARKETPLACE", "ACTIVE", null, "Saved bicycle");
        readyImage(listing);

        ResponseEntity<Map> anonymous = rest.getForEntity(
                url("/api/v1/me/saved-listings?site=MARKETPLACE"), Map.class);
        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        ResponseEntity<Map> anonymousState = rest.getForEntity(
                url("/api/v1/listings/" + listing + "/saved?site=MARKETPLACE"), Map.class);
        assertThat(anonymousState.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        ResponseEntity<Map> missingCsrf = rest.exchange(
                url("/api/v1/listings/" + listing + "/saved?site=MARKETPLACE"),
                HttpMethod.POST,
                new HttpEntity<>(null, cookieHeaders(saver.cookies())),
                Map.class);
        assertThat(missingCsrf.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(count("saved_listings", "listing_id", listing)).isZero();

        ResponseEntity<Map> initial = get(
                "/api/v1/listings/" + listing + "/saved?site=MARKETPLACE", saver);
        assertThat(initial.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(initial.getBody()).containsEntry("saved", false).containsEntry("totalCount", 0);

        ResponseEntity<Map> saved = mutate(
                "/api/v1/listings/" + listing + "/saved?site=MARKETPLACE", HttpMethod.POST, saver);
        ResponseEntity<Map> retried = mutate(
                "/api/v1/listings/" + listing + "/saved?site=MARKETPLACE", HttpMethod.POST, saver);
        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(saved.getBody())
                .containsEntry("listingId", listing.toString())
                .containsEntry("saved", true)
                .containsEntry("totalCount", 1);
        assertThat(retried.getBody()).containsEntry("saved", true).containsEntry("totalCount", 1);
        assertThat(count("saved_listings", "listing_id", listing)).isEqualTo(1);
        assertThat(listingSaveCount(listing)).isEqualTo(1);
        assertThat(eventDeltas(listing)).containsExactly("1");

        ResponseEntity<Map> feed = get(
                "/api/v1/me/saved-listings?site=MARKETPLACE", saver);
        assertThat(feed.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(feed.getBody())
                .containsEntry("hasMore", false)
                .containsEntry("totalCount", 1);
        Map<String, Object> item = items(feed).getFirst();
        assertThat(item)
                .containsEntry("id", listing.toString())
                .containsEntry("title", "Saved bicycle")
                .containsEntry("imageUrl", "https://media.test/marketplace/saved-cover.jpg")
                .containsEntry("photoCount", 1)
                .doesNotContainKeys("ownerId", "contactEmail", "contactPhone", "latitude", "longitude");
        assertThat(item.get("savedAt")).isNotNull();

        ResponseEntity<Map> detail = rest.getForEntity(
                url("/api/v1/listings/" + listing + "?site=MARKETPLACE"), Map.class);
        assertThat(detail.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(detail.getBody()).containsEntry("saveCount", 1);

        ResponseEntity<Map> otherState = get(
                "/api/v1/listings/" + listing + "/saved?site=MARKETPLACE", other);
        assertThat(otherState.getBody()).containsEntry("saved", false).containsEntry("totalCount", 0);

        ResponseEntity<Map> removed = mutate(
                "/api/v1/listings/" + listing + "/saved?site=MARKETPLACE", HttpMethod.DELETE, saver);
        ResponseEntity<Map> removedAgain = mutate(
                "/api/v1/listings/" + listing + "/saved?site=MARKETPLACE", HttpMethod.DELETE, saver);
        assertThat(removed.getBody()).containsEntry("saved", false).containsEntry("totalCount", 0);
        assertThat(removedAgain.getBody()).containsEntry("saved", false).containsEntry("totalCount", 0);
        assertThat(listingSaveCount(listing)).isZero();
        assertThat(eventDeltas(listing)).containsExactlyInAnyOrder("1", "-1");
    }

    @Test
    void savedCardsReportAvailabilityOnlyUntilItsDeadline() {
        Session saver = register("saved-availability-" + UUID.randomUUID() + "@example.test");
        UUID seller = user(true, false);
        UUID listing = listing(seller, "MARKETPLACE", "ACTIVE", null, "Available saved ad");
        mutate("/api/v1/listings/" + listing + "/saved?site=MARKETPLACE", HttpMethod.POST, saver);
        jdbc.update("INSERT INTO user_preferences(user_id, available_now, available_until) VALUES (?, true, now() + interval '20 minutes')", seller);
        var current = items(get("/api/v1/me/saved-listings?site=MARKETPLACE", saver)).getFirst();
        assertThat(current).containsEntry("availableNow", true);
        assertThat(current.get("availableUntil")).isNotNull();
        jdbc.update("UPDATE user_preferences SET available_until = now() - interval '1 second' WHERE user_id = ?", seller);
        assertThat(items(get("/api/v1/me/saved-listings?site=MARKETPLACE", saver)).getFirst())
                .containsEntry("availableNow", false);
    }

    @Test
    void inaccessibleSelfAndCrossSiteListingsDoNotLeakAndHiddenSavesCanBeRemoved() {
        Session saver = register("saved-scope-" + UUID.randomUUID() + "@example.test");
        UUID seller = user(true, false);
        UUID own = listing(saver.userId(), "MARKETPLACE", "ACTIVE", null, "Own listing");
        UUID draft = listing(seller, "MARKETPLACE", "DRAFT", null, "Draft listing");
        UUID deleted = listing(seller, "MARKETPLACE", "DELETED", null, "Deleted listing");
        UUID expired = listing(
                seller, "MARKETPLACE", "ACTIVE", Instant.now().minusSeconds(60), "Expired listing");
        UUID disabledSeller = user(false, false);
        UUID disabled = listing(disabledSeller, "MARKETPLACE", "ACTIVE", null, "Disabled seller");
        UUID personals = listing(seller, "PERSONALS", "ACTIVE", null, "Personals listing");

        for (UUID unavailable : List.of(own, draft, deleted, expired, disabled)) {
            ResponseEntity<Map> response = mutate(
                    "/api/v1/listings/" + unavailable + "/saved?site=MARKETPLACE",
                    HttpMethod.POST,
                    saver);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(response.getBody()).containsEntry("code", "LISTING_NOT_FOUND");
        }
        assertThat(get("/api/v1/listings/" + own + "/saved?site=MARKETPLACE", saver).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(mutate(
                "/api/v1/listings/" + personals + "/saved?site=MARKETPLACE",
                HttpMethod.POST,
                saver).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<Map> savedPersonals = mutate(
                "/api/v1/listings/" + personals + "/saved?site=PERSONALS", HttpMethod.POST, saver);
        assertThat(savedPersonals.getBody()).containsEntry("saved", true).containsEntry("totalCount", 1);
        ResponseEntity<Map> wrongScopeDelete = mutate(
                "/api/v1/listings/" + personals + "/saved?site=MARKETPLACE", HttpMethod.DELETE, saver);
        assertThat(wrongScopeDelete.getBody()).containsEntry("saved", false).containsEntry("totalCount", 0);
        assertThat(get(
                "/api/v1/listings/" + personals + "/saved?site=PERSONALS", saver).getBody())
                .containsEntry("saved", true);

        jdbc.update("UPDATE listings SET status = 'DELETED' WHERE id = ?", personals);
        assertThat(items(get("/api/v1/me/saved-listings?site=PERSONALS", saver))).isEmpty();
        ResponseEntity<Map> hiddenRemoved = mutate(
                "/api/v1/listings/" + personals + "/saved?site=PERSONALS", HttpMethod.DELETE, saver);
        assertThat(hiddenRemoved.getBody()).containsEntry("saved", false).containsEntry("totalCount", 0);
        assertThat(count("saved_listings", "listing_id", personals)).isZero();
        assertThat(listingSaveCount(personals)).isZero();

        ResponseEntity<Map> invalidUuid = get("/api/v1/listings/not-a-uuid/saved?site=MARKETPLACE", saver);
        assertThat(invalidUuid.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(invalidUuid.getBody()).containsEntry("code", "SAVED_LISTING_QUERY_INVALID");
        ResponseEntity<Map> invalidSite = get(
                "/api/v1/me/saved-listings?site=NOT_A_SITE", saver);
        assertThat(invalidSite.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(invalidSite.getBody()).containsEntry("code", "SAVED_LISTING_QUERY_INVALID");
        ResponseEntity<Map> missingSite = get("/api/v1/me/saved-listings", saver);
        assertThat(missingSite.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(missingSite.getBody()).containsEntry("code", "SAVED_LISTING_QUERY_INVALID");
    }

    @Test
    void savedFeedCursorIsStableAndBoundToUserAndSite() {
        Session saver = register("saved-cursor-" + UUID.randomUUID() + "@example.test");
        Session other = register("saved-cursor-other-" + UUID.randomUUID() + "@example.test");
        UUID seller = user(true, false);
        Instant base = Instant.now().minusSeconds(60);
        List<UUID> expected = new ArrayList<>();
        for (int index = 0; index < 5; index++) {
            UUID listing = listing(
                    seller, "MARKETPLACE", "ACTIVE", null, "Cursor listing " + index);
            expected.add(listing);
            insertSaved(saver.userId(), listing, base.minusSeconds(index));
        }
        UUID personals = listing(seller, "PERSONALS", "ACTIVE", null, "Other scope");
        insertSaved(saver.userId(), personals, base.plusSeconds(1));

        List<String> seen = new ArrayList<>();
        String cursor = null;
        String firstCursor = null;
        boolean hasMore;
        do {
            String cursorParameter = cursor == null ? "" : "&cursor=" + cursor;
            ResponseEntity<Map> page = get(
                    "/api/v1/me/saved-listings?site=MARKETPLACE&limit=2" + cursorParameter,
                    saver);
            assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(page.getBody()).containsEntry("totalCount", 5);
            items(page).forEach(item -> seen.add(item.get("id").toString()));
            hasMore = Boolean.TRUE.equals(page.getBody().get("hasMore"));
            cursor = page.getBody().get("nextCursor") == null
                    ? null
                    : page.getBody().get("nextCursor").toString();
            if (firstCursor == null) firstCursor = cursor;
        } while (hasMore);

        assertThat(seen).hasSize(5).doesNotHaveDuplicates();
        assertThat(new HashSet<>(seen)).isEqualTo(
                expected.stream().map(UUID::toString).collect(Collectors.toSet()));

        ResponseEntity<Map> wrongUser = get(
                "/api/v1/me/saved-listings?site=MARKETPLACE&cursor=" + firstCursor, other);
        assertThat(wrongUser.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(wrongUser.getBody()).containsEntry("code", "SAVED_LISTING_CURSOR_INVALID");
        ResponseEntity<Map> wrongSite = get(
                "/api/v1/me/saved-listings?site=PERSONALS&cursor=" + firstCursor, saver);
        assertThat(wrongSite.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        ResponseEntity<Map> malformed = get(
                "/api/v1/me/saved-listings?site=MARKETPLACE&cursor=not-a-cursor", saver);
        assertThat(malformed.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void savedFeedItemsAndCountUseTheSameDatabaseSnapshot() throws Exception {
        Session saver = register("saved-snapshot-" + UUID.randomUUID() + "@example.test");
        UUID seller = user(true, false);
        UUID first = listing(seller, "MARKETPLACE", "ACTIVE", null, "Snapshot listing one");
        UUID second = listing(seller, "MARKETPLACE", "ACTIVE", null, "Snapshot listing two");
        insertSaved(saver.userId(), first, Instant.now().minusSeconds(2));
        insertSaved(saver.userId(), second, Instant.now().minusSeconds(1));
        readyImage(first);

        CountDownLatch projectionReached = new CountDownLatch(1);
        CountDownLatch continueResponse = new CountDownLatch(1);
        AtomicBoolean firstProjection = new AtomicBoolean(true);
        given(storage.authorizeDownload(anyString())).willAnswer(invocation -> {
            if (firstProjection.compareAndSet(true, false)) {
                projectionReached.countDown();
                if (!continueResponse.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Timed out waiting to continue the saved feed.");
                }
            }
            return URI.create("https://media.test/" + invocation.getArgument(0));
        });

        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<ResponseEntity<Map>> response = executor.submit(() -> get(
                    "/api/v1/me/saved-listings?site=MARKETPLACE",
                    saver));
            assertThat(projectionReached.await(10, TimeUnit.SECONDS)).isTrue();
            jdbc.update(
                    "DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?",
                    saver.userId(),
                    first);
            continueResponse.countDown();

            ResponseEntity<Map> page = response.get(20, TimeUnit.SECONDS);
            assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(items(page)).hasSize(2);
            assertThat(page.getBody()).containsEntry("totalCount", 2);
        } finally {
            continueResponse.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void concurrentSaveCreatesOneBookmarkCountAndEvent() throws Exception {
        Session saver = register("saved-concurrent-" + UUID.randomUUID() + "@example.test");
        UUID seller = user(true, false);
        UUID listing = listing(seller, "MARKETPLACE", "ACTIVE", null, "Concurrent listing");
        int requests = 8;
        CountDownLatch ready = new CountDownLatch(requests);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(requests);
        try {
            List<Future<ResponseEntity<Map>>> futures = new ArrayList<>();
            for (int index = 0; index < requests; index++) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    start.await(10, TimeUnit.SECONDS);
                    return mutate(
                            "/api/v1/listings/" + listing + "/saved?site=MARKETPLACE",
                            HttpMethod.POST,
                            saver);
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            for (Future<ResponseEntity<Map>> future : futures) {
                assertThat(future.get(20, TimeUnit.SECONDS).getStatusCode()).isEqualTo(HttpStatus.OK);
            }
        } finally {
            executor.shutdownNow();
        }

        assertThat(count("saved_listings", "listing_id", listing)).isEqualTo(1);
        assertThat(listingSaveCount(listing)).isEqualTo(1);
        assertThat(eventDeltas(listing)).containsExactly("1");
    }

    private Session register(String email) {
        ResponseEntity<Map> csrf = rest.getForEntity(url("/api/v1/auth/csrf"), Map.class);
        String token = (String) csrf.getBody().get("token");
        String header = (String) csrf.getBody().get("headerName");
        String csrfCookies = cookies(csrf.getHeaders());
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(Map.of(
                "name", "Saved Test User",
                "email", email,
                "password", "SafeTestPass123!",
                "acceptedTerms", true), headers(header, token, csrfCookies));
        ResponseEntity<Map> registration = rest.postForEntity(
                url("/api/v1/auth/register"), request, Map.class);
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
        return new Session(UUID.fromString(registration.getBody().get("id").toString()),
                header, token, authenticatedCookies);
    }

    private UUID user(boolean enabled, boolean verified) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO app_users (
                    id, display_name, email, password_hash, enabled, email_verified, seller_verified
                ) VALUES (?, ?, ?, ?, ?, FALSE, ?)
                """,
                id,
                "Saved Listing Seller",
                id + "@example.test",
                "$2a$10$012345678901234567890u012345678901234567890123456789012",
                enabled,
                verified);
        return id;
    }

    private UUID listing(
            UUID owner,
            String site,
            String status,
            Instant expiresAt,
            String title) {
        UUID id = UUID.randomUUID();
        String category = site.equals("PERSONALS") ? "personals" : "vehicles";
        jdbc.update("""
                INSERT INTO listings (
                    id, owner_id, site_scope, status, title, business_name, description,
                    price, category_id, province_id, location_id, contact_email, contact_phone,
                    published_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bc', 'bc-1', ?, ?, now(), ?)
                """,
                id,
                owner,
                site,
                status,
                title,
                "Saved Seller",
                "A listing used to verify saved-listing behavior.",
                125,
                category,
                "seller@example.test",
                "+1 250 555 0100",
                expiresAt == null ? null : Timestamp.from(expiresAt));
        return id;
    }

    private void insertSaved(UUID userId, UUID listingId, Instant savedAt) {
        jdbc.update(
                "INSERT INTO saved_listings (id, user_id, listing_id, saved_at) VALUES (?, ?, ?, ?)",
                UUID.randomUUID(), userId, listingId, Timestamp.from(savedAt));
    }

    private void readyImage(UUID listingId) {
        jdbc.update("""
                INSERT INTO listing_media (
                    id, listing_id, object_key, original_filename, content_type,
                    size_bytes, checksum_sha256, status, position, upload_expires_at, ready_at
                ) VALUES (?, ?, ?, 'saved.jpg', 'image/jpeg', 3, ?, 'READY', 0, now(), now())
                """,
                UUID.randomUUID(), listingId, "marketplace/saved-cover.jpg", "a".repeat(64));
    }

    private ResponseEntity<Map> get(String path, Session session) {
        return rest.exchange(
                url(path),
                HttpMethod.GET,
                new HttpEntity<>(null, cookieHeaders(session.cookies())),
                Map.class);
    }

    private ResponseEntity<Map> mutate(String path, HttpMethod method, Session session) {
        return rest.exchange(
                url(path),
                method,
                new HttpEntity<>(null, headers(
                        session.csrfHeader(), session.csrfToken(), session.cookies())),
                Map.class);
    }

    private HttpHeaders headers(String csrfHeader, String csrfToken, String cookies) {
        HttpHeaders headers = cookieHeaders(cookies);
        headers.set(csrfHeader, csrfToken);
        return headers;
    }

    private HttpHeaders cookieHeaders(String cookies) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, cookies);
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

    private long count(String table, String column, UUID id) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE " + column + " = ?", Long.class, id);
        return count == null ? 0 : count;
    }

    private long listingSaveCount(UUID listingId) {
        Long count = jdbc.queryForObject(
                "SELECT save_count FROM listings WHERE id = ?", Long.class, listingId);
        return count == null ? 0 : count;
    }

    private List<String> eventDeltas(UUID listingId) {
        return jdbc.queryForList(
                """
                        SELECT payload ->> 'delta'
                        FROM listing_events
                        WHERE listing_id = ? AND event_type = 'LISTING_SAVE_COUNT_CHANGED'
                        """,
                String.class,
                listingId);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> items(ResponseEntity<Map> response) {
        return (List<Map<String, Object>>) response.getBody().get("items");
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private record Session(
            UUID userId,
            String csrfHeader,
            String csrfToken,
            String cookies) {
    }
}
