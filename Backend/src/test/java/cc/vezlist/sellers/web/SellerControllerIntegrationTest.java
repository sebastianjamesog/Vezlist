package cc.vezlist.sellers.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
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
class SellerControllerIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired private TestRestTemplate rest;
    @Autowired private JdbcTemplate jdbc;
    @MockitoBean private ObjectStorage storage;
    @LocalServerPort private int port;

    @BeforeEach void resetData() {
        jdbc.update("DELETE FROM listings");
        jdbc.update("DELETE FROM app_users");
    }

    @Test void profileIsPublicButLeaksNoPrivateFieldsAndOnlyShowsActiveSiteListings() {
        UUID seller = user();
        listing(seller, "MARKETPLACE", "ACTIVE", "Public marketplace listing");
        listing(seller, "MARKETPLACE", "DRAFT", "Hidden draft");
        listing(seller, "PERSONALS", "ACTIVE", "Hidden cross-site listing");
        ResponseEntity<Map> response = rest.getForEntity(url("/api/v1/sellers/" + seller + "?site=MARKETPLACE"), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("activeListingCount", 1);
        Map<String, Object> publicSeller = (Map<String, Object>) response.getBody().get("seller");
        assertThat(publicSeller).containsKeys("id", "displayName", "memberSince", "verified")
                .doesNotContainKeys("email", "phone", "bio", "location", "roles", "enabled");
        List<Map<String, Object>> items = (List<Map<String, Object>>) response.getBody().get("items");
        assertThat(items).extracting(item -> item.get("title")).containsExactly("Public marketplace listing");
    }

    @Test void rejectsUnknownSellerAndInvalidLimit() {
        ResponseEntity<Map> missing = rest.getForEntity(url("/api/v1/sellers/" + UUID.randomUUID() + "?site=MARKETPLACE"), Map.class);
        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(missing.getBody()).containsEntry("code", "SELLER_NOT_FOUND");
        UUID seller = user();
        ResponseEntity<Map> invalid = rest.getForEntity(url("/api/v1/sellers/" + seller + "?site=MARKETPLACE&limit=51"), Map.class);
        assertThat(invalid.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(invalid.getBody()).containsEntry("code", "SELLER_QUERY_INVALID");
    }

    @Test void trendingRanksCreatorsByLikesAndViewsAndCountsAViewOncePerViewer() {
        UUID quiet = user();
        UUID popular = user();
        listing(quiet, "PERSONALS", "ACTIVE", "Quiet post");
        UUID hit = listing(popular, "PERSONALS", "ACTIVE", "Popular post");
        listing(popular, "MARKETPLACE", "ACTIVE", "Other-site post");
        jdbc.update("UPDATE listings SET save_count = 2 WHERE id = ?", hit);

        // Two opens by the same anonymous client count as one view; the owner's own open is never counted.
        rest.getForEntity(url("/api/v1/listings/" + hit + "?site=PERSONALS"), Map.class);
        rest.getForEntity(url("/api/v1/listings/" + hit + "?site=PERSONALS"), Map.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM listing_views WHERE listing_id = ?", Long.class, hit))
                .isEqualTo(1L);

        ResponseEntity<List> trending = rest.getForEntity(url("/api/v1/sellers/trending?site=PERSONALS"), List.class);
        assertThat(trending.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> rows = trending.getBody();
        assertThat(rows).extracting(row -> row.get("id")).containsExactly(popular.toString(), quiet.toString());
        assertThat(rows.getFirst()).containsEntry("postCount", 1).containsEntry("viewCount", 1)
                .containsEntry("likeCount", 2).doesNotContainKeys("email", "phone");

        ResponseEntity<Map> profile = rest.getForEntity(url("/api/v1/sellers/" + popular + "?site=PERSONALS"), Map.class);
        assertThat(profile.getBody()).containsEntry("viewCount", 1).containsEntry("likeCount", 2);
    }

    @Test void trendingRejectsAnInvalidLimit() {
        ResponseEntity<Map> invalid = rest.getForEntity(url("/api/v1/sellers/trending?site=PERSONALS&limit=0"), Map.class);
        assertThat(invalid.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(invalid.getBody()).containsEntry("code", "SELLER_QUERY_INVALID");
    }

    private UUID user() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO app_users (id, display_name, email, password_hash, enabled, email_verified, seller_verified)
                VALUES (?, 'Public Seller', ?, ?, TRUE, FALSE, TRUE)""", id, id + "@private.test",
                "$2a$10$012345678901234567890u012345678901234567890123456789012");
        return id;
    }
    private UUID listing(UUID seller, String site, String status, String title) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings (id, owner_id, site_scope, status, title, business_name, description, price,
                category_id, province_id, location_id, contact_email, contact_phone, published_at)
                VALUES (?, ?, ?, ?, ?, 'Business', 'Description', 10, ?, 'bc', 'bc-1', 'private@example.test', '+15550100', ?)""",
                id, seller, site, status, title, site.equals("PERSONALS") ? "personals" : "services",
                Timestamp.from(Instant.now()));
        return id;
    }
    private String url(String path) { return "http://localhost:" + port + path; }
}
