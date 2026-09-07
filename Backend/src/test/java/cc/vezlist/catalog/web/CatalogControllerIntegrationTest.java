package cc.vezlist.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
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
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CatalogControllerIntegrationTest {

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

    @LocalServerPort
    private int port;

    @Test
    void publicCatalogIsSeededCachedAndSeparatedBySite() {
        ResponseEntity<List> marketplace = rest.getForEntity(
                url("/api/v1/categories?site=MARKETPLACE"), List.class);
        assertThat(marketplace.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(marketplace.getHeaders().getCacheControl()).contains("max-age=3600").contains("public");
        assertThat(marketplace.getBody()).hasSize(19);
        assertThat(marketplace.getBody().toString()).contains("vehicles").doesNotContain("personals");

        ResponseEntity<List> personals = rest.getForEntity(
                url("/api/v1/categories?site=PERSONALS"), List.class);
        assertThat(personals.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(personals.getBody()).hasSize(1);
        assertThat(personals.getBody().toString()).contains("personals").doesNotContain("vehicles");

        ResponseEntity<Map> locations = rest.getForEntity(url("/api/v1/locations"), Map.class);
        assertThat(locations.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((List<?>) locations.getBody().get("provinces")).hasSize(13);
        assertThat((List<?>) locations.getBody().get("popularAreas")).hasSize(8);
    }

    @Test
    void invalidSiteIsRejectedAsAClientError() {
        ResponseEntity<Map> response = rest.getForEntity(url("/api/v1/categories?site=UNKNOWN"), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).containsEntry("code", "CATALOG_REFERENCE_INVALID");
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
