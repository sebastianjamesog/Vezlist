package cc.vezlist.discovery.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;

import java.net.URI;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import io.micrometer.core.instrument.MeterRegistry;
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
class DiscoveryControllerIntegrationTest {

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

    @Autowired
    private MeterRegistry metrics;

    @MockitoBean
    private ObjectStorage storage;

    @LocalServerPort
    private int port;

    @BeforeEach
    void resetData() {
        jdbc.update("DELETE FROM listings");
        jdbc.update("DELETE FROM app_users");
        given(storage.authorizeDownload(anyString()))
                .willAnswer(invocation -> URI.create("https://media.test/" + invocation.getArgument(0)));
    }

    @Test
    void publicSearchCombinesFiltersAndNeverLeaksStatusOrSite() {
        UUID verified = user(true);
        UUID unverified = user(false);
        Instant recent = Instant.now().minusSeconds(3600);
        UUID match = listing(
                verified, "MARKETPLACE", "ACTIVE", "Red touring bicycle", "Island Cycle Shop",
                850, "vehicles", "bc", "bc-1", recent, 48.4284, -123.3656);
        listing(
                unverified, "MARKETPLACE", "ACTIVE", "Red commuter bicycle", "Other Seller",
                700, "vehicles", "bc", "bc-1", recent, 48.43, -123.36);
        listing(
                verified, "MARKETPLACE", "DRAFT", "Red hidden bicycle", "Island Cycle Shop",
                800, "vehicles", "bc", "bc-1", recent, 48.43, -123.36);
        listing(
                verified, "PERSONALS", "ACTIVE", "Red private post", "Island Cycle Shop",
                800, "personals", "bc", "bc-1", recent, 48.43, -123.36);
        readyImage(match);

        ResponseEntity<Map> response = rest.getForEntity(url(
                "/api/v1/listings?site=MARKETPLACE&q=cycle&category=vehicles"
                        + "&province=bc&area=bc-1&minPrice=800&maxPrice=900"
                        + "&verifiedOnly=true&postedWithin=DAYS_7"), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> items = items(response);
        assertThat(items).hasSize(1);
        assertThat(items.getFirst())
                .containsEntry("id", match.toString())
                .containsEntry("site", "MARKETPLACE")
                .containsEntry("verified", true)
                .containsEntry("photoCount", 1)
                .containsEntry("imageUrl", "https://media.test/marketplace/cover.jpg");
        assertThat(metrics.find("vezlist.discovery.query")
                .tag("endpoint", "search")
                .tag("site", "marketplace")
                .timer()
                .count()).isPositive();
    }

    @Test
    void keysetCursorHasNoDuplicatesAndIsBoundToItsFilters() {
        UUID owner = user(true);
        Instant published = Instant.parse("2026-09-10T10:00:00Z");
        for (int index = 0; index < 5; index++) {
            listing(owner, "MARKETPLACE", "ACTIVE", "Cursor item " + index, "Cursor Seller",
                    100 + index, "vehicles", "bc", "bc-1",
                    published.minusSeconds(index), 48.4284, -123.3656);
        }

        List<String> ids = new ArrayList<>();
        String cursor = null;
        String firstCursor = null;
        boolean hasMore;
        do {
            String cursorParameter = cursor == null ? "" : "&cursor=" + cursor;
            ResponseEntity<Map> page = rest.getForEntity(
                    url("/api/v1/listings?site=MARKETPLACE&limit=2" + cursorParameter), Map.class);
            assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
            items(page).forEach(item -> ids.add(item.get("id").toString()));
            hasMore = Boolean.TRUE.equals(page.getBody().get("hasMore"));
            cursor = page.getBody().get("nextCursor") == null
                    ? null
                    : page.getBody().get("nextCursor").toString();
            if (firstCursor == null) firstCursor = cursor;
        } while (hasMore);

        assertThat(ids).hasSize(5);
        assertThat(ids).doesNotHaveDuplicates();

        ResponseEntity<Map> wrongFilters = rest.getForEntity(
                url("/api/v1/listings?site=MARKETPLACE&category=jobs&limit=2&cursor=" + firstCursor), Map.class);
        assertThat(wrongFilters.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(wrongFilters.getBody()).containsEntry("code", "DISCOVERY_CURSOR_INVALID");
    }

    @Test
    void priceSortAndValidationAreDeterministic() {
        UUID owner = user(false);
        Instant published = Instant.now().minusSeconds(60);
        listing(owner, "MARKETPLACE", "ACTIVE", "Expensive", "Seller", 900,
                "vehicles", "bc", "bc-1", published, null, null);
        listing(owner, "MARKETPLACE", "ACTIVE", "Affordable", "Seller", 100,
                "vehicles", "bc", "bc-1", published, null, null);

        ResponseEntity<Map> response = rest.getForEntity(url(
                "/api/v1/listings?site=MARKETPLACE&sort=PRICE_ASC"), Map.class);
        assertThat(items(response)).extracting(item -> item.get("title"))
                .containsExactly("Affordable", "Expensive");

        ResponseEntity<Map> invalidPrices = rest.getForEntity(url(
                "/api/v1/listings?site=MARKETPLACE&minPrice=20&maxPrice=10"), Map.class);
        assertThat(invalidPrices.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(invalidPrices.getBody()).containsEntry("code", "DISCOVERY_QUERY_INVALID");

        ResponseEntity<Map> missingCoordinates = rest.getForEntity(url(
                "/api/v1/listings?site=MARKETPLACE&sort=NEAREST"), Map.class);
        assertThat(missingCoordinates.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void nearestSearchAndMapUsePostgisDistanceAndBoundedRadius() {
        UUID owner = user(true);
        Instant published = Instant.now().minusSeconds(60);
        UUID closest = listing(owner, "MARKETPLACE", "ACTIVE", "Closest", "Seller", 10,
                "services", "bc", "bc-1", published, 48.4284, -123.3656);
        UUID farther = listing(owner, "MARKETPLACE", "ACTIVE", "Farther", "Seller", 20,
                "services", "bc", "bc-1", published, 48.4374, -123.3656);
        listing(owner, "MARKETPLACE", "ACTIVE", "Outside", "Seller", 30,
                "services", "bc", "bc-1", published, 48.50, -123.3656);

        String geo = "site=MARKETPLACE&sort=NEAREST&latitude=48.4284&longitude=-123.3656&radiusKm=5";
        ResponseEntity<Map> response = rest.getForEntity(url("/api/v1/listings?" + geo), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(items(response)).extracting(item -> item.get("id"))
                .containsExactly(closest.toString(), farther.toString());
        assertThat(((Number) items(response).get(0).get("distanceKm")).doubleValue()).isLessThan(0.01);
        assertThat(((Number) items(response).get(1).get("distanceKm")).doubleValue())
                .isBetween(0.9, 1.2);

        ResponseEntity<List> pins = rest.getForEntity(url(
                "/api/v1/listings/map?site=MARKETPLACE&latitude=48.4284"
                        + "&longitude=-123.3656&radiusKm=5"), List.class);
        assertThat(pins.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(pins.getBody()).hasSize(2);
        assertThat(((Map<?, ?>) pins.getBody().getFirst()).containsKey("latitude")).isTrue();

        ResponseEntity<Map> excessiveRadius = rest.getForEntity(url(
                "/api/v1/listings/map?site=MARKETPLACE&latitude=48.4284"
                        + "&longitude=-123.3656&radiusKm=101"), Map.class);
        assertThat(excessiveRadius.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private UUID user(boolean verified) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO app_users (
                    id, display_name, email, password_hash, enabled, email_verified, seller_verified
                ) VALUES (?, ?, ?, ?, TRUE, FALSE, ?)
                """,
                id,
                "Discovery Seller",
                id + "@example.test",
                "$2a$10$012345678901234567890u012345678901234567890123456789012",
                verified);
        return id;
    }

    private UUID listing(
            UUID owner,
            String site,
            String status,
            String title,
            String business,
            int price,
            String category,
            String province,
            String area,
            Instant published,
            Double latitude,
            Double longitude) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings (
                    id, owner_id, site_scope, status, title, business_name, description,
                    price, category_id, province_id, location_id, contact_email, contact_phone,
                    latitude, longitude, published_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                id, owner, site, status, title, business,
                "A searchable discovery description for " + title,
                price, category, province, area, "seller@example.test", "+1 250 555 0100",
                latitude, longitude, Timestamp.from(published));
        return id;
    }

    private void readyImage(UUID listingId) {
        jdbc.update("""
                INSERT INTO listing_media (
                    id, listing_id, object_key, original_filename, content_type,
                    size_bytes, checksum_sha256, status, position, upload_expires_at, ready_at
                ) VALUES (?, ?, ?, 'cover.jpg', 'image/jpeg', 3, ?, 'READY', 0, now(), now())
                """,
                UUID.randomUUID(), listingId, "marketplace/cover.jpg", "a".repeat(64));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> items(ResponseEntity<Map> response) {
        return (List<Map<String, Object>>) response.getBody().get("items");
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
