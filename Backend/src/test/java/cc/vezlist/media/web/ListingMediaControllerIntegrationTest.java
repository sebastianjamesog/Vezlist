package cc.vezlist.media.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import cc.vezlist.media.storage.ObjectStorage;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@Tag("integration")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(ListingMediaControllerIntegrationTest.StorageTestConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ListingMediaControllerIntegrationTest {

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
    private FakeObjectStorage storage;

    @LocalServerPort
    private int port;

    @Test
    void uploadValidateOrderDeleteAndListingCleanup() throws Exception {
        Session owner = register("media-owner-" + UUID.randomUUID() + "@example.test");
        Session other = register("media-other-" + UUID.randomUUID() + "@example.test");
        String listingId = createListing(owner);

        byte[] firstBytes = jpeg(1);
        ResponseEntity<Map> firstAuthorization = authorize(owner, listingId, "first.jpg", firstBytes);
        assertThat(firstAuthorization.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(firstAuthorization.getBody().get("uploadUrl").toString()).startsWith("https://storage.test/");
        Map<String, String> requiredHeaders =
                (Map<String, String>) firstAuthorization.getBody().get("requiredHeaders");
        assertThat(requiredHeaders).containsKeys("content-type", "x-amz-meta-sha256");
        String firstId = firstAuthorization.getBody().get("mediaId").toString();

        ResponseEntity<Map> crossOwner = authorize(other, listingId, "stolen.jpg", jpeg(2));
        assertThat(crossOwner.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        storage.upload(UUID.fromString(firstId), firstBytes, "image/jpeg", sha256(firstBytes));
        ResponseEntity<Map> completed = exchange(
                "/api/v1/listings/" + listingId + "/media/" + firstId + "/complete",
                HttpMethod.POST, null, owner, Map.class);
        assertThat(completed.getStatusCode()).isEqualTo(HttpStatus.OK);
        awaitStatus(owner, listingId, firstId, "READY");

        byte[] secondBytes = jpeg(2);
        ResponseEntity<Map> secondAuthorization = authorize(owner, listingId, "second.jpg", secondBytes);
        String secondId = secondAuthorization.getBody().get("mediaId").toString();
        storage.upload(UUID.fromString(secondId), secondBytes, "image/jpeg", sha256(secondBytes));
        exchange(
                "/api/v1/listings/" + listingId + "/media/" + secondId + "/complete",
                HttpMethod.POST, null, owner, Map.class);
        awaitStatus(owner, listingId, secondId, "READY");

        ResponseEntity<List> reordered = exchange(
                "/api/v1/listings/" + listingId + "/media/order",
                HttpMethod.PATCH,
                Map.of("mediaIds", List.of(firstId, secondId), "coverMediaId", secondId),
                owner,
                List.class);
        assertThat(reordered.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((Map<?, ?>) reordered.getBody().getFirst()).get("id").toString())
                .isEqualTo(secondId);
        assertThat(((Map<?, ?>) reordered.getBody().getFirst()).get("cover"))
                .isEqualTo(true);

        ResponseEntity<Void> removed = exchange(
                "/api/v1/listings/" + listingId + "/media/" + firstId,
                HttpMethod.DELETE, null, owner, Void.class);
        assertThat(removed.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(storage.deletedMedia()).contains(UUID.fromString(firstId));

        ResponseEntity<Void> listingDeleted = exchange(
                "/api/v1/listings/" + listingId,
                HttpMethod.DELETE, null, owner, Void.class);
        assertThat(listingDeleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(storage.deletedMedia()).contains(UUID.fromString(secondId));
    }

    @Test
    void validatesTypeLimitAndExpiredUpload() throws Exception {
        Session owner = register("media-validation-" + UUID.randomUUID() + "@example.test");
        String listingId = createListing(owner);

        ResponseEntity<Map> wrongType = exchange(
                "/api/v1/listings/" + listingId + "/media/upload-url",
                HttpMethod.POST,
                Map.of(
                        "fileName", "script.svg",
                        "contentType", "image/svg+xml",
                        "sizeBytes", 100,
                        "checksumSha256", "a".repeat(64)),
                owner,
                Map.class);
        assertThat(wrongType.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        for (int index = 0; index < 6; index++) {
            assertThat(authorize(owner, listingId, "image-" + index + ".jpg", jpeg(index)).getStatusCode())
                    .isEqualTo(HttpStatus.OK);
        }
        ResponseEntity<Map> seventh = authorize(owner, listingId, "seventh.jpg", jpeg(9));
        assertThat(seventh.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(seventh.getBody()).containsEntry("code", "MEDIA_VALIDATION_ERROR");

        String expiredListingId = createListing(owner);
        storage.expireNextAuthorization();
        ResponseEntity<Map> expiredAuthorization =
                authorize(owner, expiredListingId, "expired.jpg", jpeg(5));
        String expiredMediaId = expiredAuthorization.getBody().get("mediaId").toString();
        ResponseEntity<Map> expiredComplete = exchange(
                "/api/v1/listings/" + expiredListingId + "/media/" + expiredMediaId + "/complete",
                HttpMethod.POST, null, owner, Map.class);
        assertThat(expiredComplete.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

        String rejectedListingId = createListing(owner);
        byte[] declaredBytes = jpeg(6);
        ResponseEntity<Map> rejectedAuthorization =
                authorize(owner, rejectedListingId, "tampered.jpg", declaredBytes);
        String rejectedMediaId = rejectedAuthorization.getBody().get("mediaId").toString();
        storage.upload(
                UUID.fromString(rejectedMediaId),
                jpeg(7),
                "image/jpeg",
                sha256(declaredBytes));
        exchange(
                "/api/v1/listings/" + rejectedListingId + "/media/" + rejectedMediaId + "/complete",
                HttpMethod.POST, null, owner, Map.class);
        awaitStatus(owner, rejectedListingId, rejectedMediaId, "REJECTED");

        ResponseEntity<Map> rejectedDetail = exchange(
                "/api/v1/listings/" + rejectedListingId + "?site=MARKETPLACE",
                HttpMethod.GET, null, owner, Map.class);
        Map<?, ?> rejectedMedia = (Map<?, ?>) ((List<?>) rejectedDetail.getBody().get("media")).getFirst();
        assertThat(rejectedMedia.get("url")).isNull();
        assertThat(storage.deletedMedia()).contains(UUID.fromString(rejectedMediaId));
    }

    private ResponseEntity<Map> authorize(
            Session session,
            String listingId,
            String fileName,
            byte[] bytes) throws Exception {
        return exchange(
                "/api/v1/listings/" + listingId + "/media/upload-url",
                HttpMethod.POST,
                Map.of(
                        "fileName", fileName,
                        "contentType", "image/jpeg",
                        "sizeBytes", bytes.length,
                        "checksumSha256", sha256(bytes)),
                session,
                Map.class);
    }

    private void awaitStatus(Session owner, String listingId, String mediaId, String expected)
            throws InterruptedException {
        for (int attempt = 0; attempt < 40; attempt++) {
            ResponseEntity<Map> detail = exchange(
                    "/api/v1/listings/" + listingId + "?site=MARKETPLACE",
                    HttpMethod.GET, null, owner, Map.class);
            List<Map<String, Object>> images =
                    (List<Map<String, Object>>) detail.getBody().get("media");
            String status = images.stream()
                    .filter(image -> image.get("id").toString().equals(mediaId))
                    .map(image -> image.get("status").toString())
                    .findFirst()
                    .orElse("");
            if (expected.equals(status)) return;
            Thread.sleep(50);
        }
        throw new AssertionError("Media " + mediaId + " did not reach " + expected);
    }

    private String createListing(Session owner) {
        ResponseEntity<Map> response = exchange(
                "/api/v1/listings",
                HttpMethod.POST,
                Map.ofEntries(
                        Map.entry("site", "MARKETPLACE"),
                        Map.entry("title", "Listing with persistent photos"),
                        Map.entry("businessName", "Media Test Seller"),
                        Map.entry("description", "A complete listing used to verify media uploads."),
                        Map.entry("price", 125),
                        Map.entry("categoryId", "vehicles"),
                        Map.entry("provinceId", "bc"),
                        Map.entry("locationId", "bc-1"),
                        Map.entry("contactEmail", "seller@example.test"),
                        Map.entry("contactPhone", "+1 250 555 0100"),
                        Map.entry("attributes", Map.of())),
                owner,
                Map.class,
                "create-" + UUID.randomUUID());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getBody().get("id").toString();
    }

    private byte[] jpeg(int marker) {
        return new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) marker, 1, 2, 3};
    }

    private String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private Session register(String email) {
        ResponseEntity<Map> csrf = rest.getForEntity(url("/api/v1/auth/csrf"), Map.class);
        String token = (String) csrf.getBody().get("token");
        String header = (String) csrf.getBody().get("headerName");
        String csrfCookies = cookies(csrf.getHeaders());
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(Map.of(
                "name", "Media Test User",
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
            String path,
            HttpMethod method,
            Object body,
            Session session,
            Class<T> responseType) {
        return exchange(path, method, body, session, responseType, null);
    }

    private <T> ResponseEntity<T> exchange(
            String path,
            HttpMethod method,
            Object body,
            Session session,
            Class<T> responseType,
            String idempotencyKey) {
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

    @TestConfiguration
    static class StorageTestConfiguration {
        @Bean
        @Primary
        FakeObjectStorage fakeObjectStorage() {
            return new FakeObjectStorage();
        }
    }

    static class FakeObjectStorage implements ObjectStorage {
        private final Map<String, StoredFile> files = new ConcurrentHashMap<>();
        private final Map<UUID, String> reservedKeys = new ConcurrentHashMap<>();
        private final Set<UUID> deleted = ConcurrentHashMap.newKeySet();
        private volatile boolean expireNext;

        @Override
        public UploadTarget authorizeUpload(
                String objectKey,
                String contentType,
                long sizeBytes,
                String checksumSha256) {
            Instant expiry = expireNext ? Instant.now().minusSeconds(1) : Instant.now().plusSeconds(600);
            expireNext = false;
            mediaId(objectKey).ifPresent(id -> reservedKeys.put(id, objectKey));
            return new UploadTarget(
                    URI.create("https://storage.test/" + objectKey),
                    Map.of(
                            "content-type", contentType,
                            "x-amz-meta-sha256", checksumSha256),
                    expiry);
        }

        @Override
        public StoredObject describe(String objectKey) {
            StoredFile file = files.get(objectKey);
            if (file == null) throw new IllegalStateException("Object not uploaded");
            return new StoredObject(
                    file.bytes().length,
                    file.contentType(),
                    Map.of("sha256", file.checksum()));
        }

        @Override
        public InputStream open(String objectKey) {
            StoredFile file = files.get(objectKey);
            if (file == null) throw new IllegalStateException("Object not uploaded");
            return new ByteArrayInputStream(file.bytes());
        }

        @Override
        public URI authorizeDownload(String objectKey) {
            return URI.create("https://cdn.test/" + objectKey);
        }

        @Override
        public URI authorizeDownload(String objectKey, java.time.Duration maximumTtl) {
            return authorizeDownload(objectKey);
        }

        @Override
        public void store(String objectKey, String contentType, byte[] bytes) {
            files.put(objectKey, new StoredFile(bytes, contentType, ""));
        }

        @Override
        public void delete(String objectKey) {
            files.remove(objectKey);
            mediaId(objectKey).ifPresent(deleted::add);
        }

        void upload(UUID mediaId, byte[] bytes, String contentType, String checksum) {
            String key = reservedKeys.get(mediaId);
            if (key == null) throw new IllegalStateException("No upload was authorized for " + mediaId);
            files.put(key, new StoredFile(bytes, contentType, checksum));
        }

        void expireNextAuthorization() {
            expireNext = true;
        }

        Set<UUID> deletedMedia() {
            return Set.copyOf(deleted);
        }

        private java.util.Optional<UUID> mediaId(String key) {
            String file = key.substring(key.lastIndexOf('/') + 1);
            int dot = file.indexOf('.');
            try {
                return java.util.Optional.of(UUID.fromString(dot < 0 ? file : file.substring(0, dot)));
            } catch (IllegalArgumentException ignored) {
                return java.util.Optional.empty();
            }
        }

        private record StoredFile(byte[] bytes, String contentType, String checksum) {
        }
    }
}
