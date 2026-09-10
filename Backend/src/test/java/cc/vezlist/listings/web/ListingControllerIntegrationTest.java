package cc.vezlist.listings.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.BeforeEach;
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

import cc.vezlist.media.storage.ObjectStorage;

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

        ResponseEntity<Map> submitted = exchange(
                "/api/v1/listings/" + listingId + "/submit", HttpMethod.POST, null,
                owner, "submit-listing-1", Map.class);
        assertThat(submitted.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(submitted.getBody()).containsEntry("status", "PENDING_REVIEW");

        ResponseEntity<Map> submitRetry = exchange(
                "/api/v1/listings/" + listingId + "/submit", HttpMethod.POST, null,
                owner, "submit-listing-1", Map.class);
        assertThat(submitRetry.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(submitRetry.getBody()).containsEntry("status", "PENDING_REVIEW");

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

    private Map<String, Object> validListing() {
        return Map.ofEntries(
                Map.entry("site", "MARKETPLACE"),
                Map.entry("title", "2012 Honda Accord EX-L"),
                Map.entry("businessName", "Test Seller"),
                Map.entry("description", "A complete, carefully maintained vehicle listing."),
                Map.entry("price", 10250),
                Map.entry("categoryId", "vehicles"),
                Map.entry("provinceId", "bc"),
                Map.entry("locationId", "bc-1"),
                Map.entry("contactEmail", "seller@example.test"),
                Map.entry("contactPhone", "+1 250 555 0100"),
                Map.entry("attributes", Map.of("condition", "Used")));
    }

    private void addReadyImage(String listingId) {
        UUID mediaId = UUID.randomUUID();
        jdbc.update("""
                insert into listing_media (
                    id, listing_id, object_key, original_filename, content_type,
                    size_bytes, checksum_sha256, status, position, upload_expires_at, ready_at
                ) values (?, ?::uuid, ?, ?, ?, ?, ?, 'READY', 0, now() + interval '10 minutes', now())
                """,
                mediaId,
                listingId,
                "marketplace/listings/" + listingId + "/" + mediaId + ".jpg",
                "test.jpg",
                "image/jpeg",
                3,
                "a".repeat(64));
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
        return new Session(header, token, mergeCookies(csrfCookies, cookies(registration.getHeaders())));
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
        return List.of(cookieHeaders).stream()
                .filter(value -> value != null && !value.isBlank())
                .collect(Collectors.joining("; "));
    }

    private record Session(String csrfHeader, String csrfToken, String cookies) {
    }
}
