package cc.vezlist.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import cc.vezlist.catalog.application.CatalogReferenceInvalidException;
import cc.vezlist.catalog.application.CatalogService;
import cc.vezlist.catalog.domain.Category;
import cc.vezlist.catalog.domain.Location;
import cc.vezlist.catalog.domain.LocationType;
import cc.vezlist.catalog.persistence.CategoryRepository;
import cc.vezlist.catalog.persistence.LocationRepository;
import cc.vezlist.shared.domain.SiteScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
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

    @Autowired
    private LocationRepository locations;

    @Autowired
    private CategoryRepository categories;

    @Autowired
    private CatalogService catalog;

    private final List<String> fixtureAreaIds = new ArrayList<>();
    private final List<String> fixtureProvinceIds = new ArrayList<>();
    private final List<String> fixtureCategoryIds = new ArrayList<>();

    @LocalServerPort
    private int port;

    @AfterEach
    void removeSearchFixtures() {
        locations.deleteAllById(fixtureAreaIds);
        locations.deleteAllById(fixtureProvinceIds);
        categories.deleteAllById(fixtureCategoryIds);
    }

    @Test
    void publicCatalogIsSeededAndSeparatedBySiteWithFreshCategories() {
        ResponseEntity<List> marketplace = rest.getForEntity(
                url("/api/v1/categories?site=MARKETPLACE"), List.class);
        assertThat(marketplace.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(marketplace.getHeaders().getCacheControl()).contains("no-cache");
        assertThat(marketplace.getBody()).hasSize(19);
        assertThat(marketplace.getBody().toString()).contains("vehicles").doesNotContain("personals");

        ResponseEntity<List> personals = rest.getForEntity(
                url("/api/v1/categories?site=PERSONALS"), List.class);
        assertThat(personals.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(personals.getHeaders().getCacheControl()).contains("no-cache");
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

    @ParameterizedTest
    @EnumSource(SiteScope.class)
    void publicCategoriesReflectDatabaseEditsAndStayWithinTheirSite(SiteScope site) {
        SiteScope oppositeSite = site == SiteScope.MARKETPLACE ? SiteScope.PERSONALS : SiteScope.MARKETPLACE;
        String id = "dynamic-category-" + site.name();
        assertThat(publicCategories(site)).extracting(CategoryResponse::id).doesNotContain(id);

        Category category = category(id, "Fresh category", site);
        Category opposite = category("dynamic-category-other", "Other site category", oppositeSite);
        CategoryResponse initial = new CategoryResponse(id, "Fresh category", "Tag", false);
        assertThat(publicCategories(site)).contains(initial)
                .extracting(CategoryResponse::id).doesNotContain(opposite.getId());
        assertThat(publicCategories(oppositeSite)).extracting(CategoryResponse::id)
                .contains(opposite.getId()).doesNotContain(id);

        category.update("Renamed category", "Music", true, 0);
        categories.save(category);
        CategoryResponse renamed = new CategoryResponse(id, "Renamed category", "Music", true);
        assertThat(publicCategories(site)).startsWith(renamed).doesNotContain(initial);

        category.setEnabled(false);
        categories.save(category);
        assertThat(publicCategories(site)).extracting(CategoryResponse::id).doesNotContain(id);

        category.setEnabled(true);
        categories.save(category);
        assertThat(publicCategories(site)).startsWith(renamed)
                .extracting(CategoryResponse::id).doesNotContain(opposite.getId());
    }

    @Test
    void categoryReferenceValidationRejectsDisabledUnknownAndOppositeSiteIds() {
        Category category = category("dynamic-category-validation", "Category validation", SiteScope.MARKETPLACE);
        catalog.requireEnabledCategory(SiteScope.MARKETPLACE, category.getId());
        assertThatThrownBy(() -> catalog.requireEnabledCategory(SiteScope.PERSONALS, category.getId()))
                .isInstanceOf(CatalogReferenceInvalidException.class);

        category.setEnabled(false);
        categories.save(category);
        assertThatThrownBy(() -> catalog.requireEnabledCategory(SiteScope.MARKETPLACE, category.getId()))
                .isInstanceOf(CatalogReferenceInvalidException.class);
        assertThatThrownBy(() -> catalog.requireEnabledCategory(SiteScope.MARKETPLACE, "category-that-does-not-exist"))
                .isInstanceOf(CatalogReferenceInvalidException.class);
    }

    @Test
    void locationSuggestionsArePublicBoundedAndPrioritizePopularAreas() {
        ResponseEntity<LocationResponse[]> response = rest.getForEntity(
                url("/api/v1/locations/search"), LocationResponse[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getCacheControl()).contains("no-cache");
        assertThat(response.getBody()).hasSize(20);
        assertThat(response.getBody()).allSatisfy(area -> {
            assertThat(area.provinceId()).isNotBlank();
            assertThat(area.provinceLabel()).isNotBlank();
        });
        assertThat(List.of(response.getBody()).subList(0, 8)).allMatch(LocationResponse::popular);
        assertThat(List.of(response.getBody()).subList(8, 20)).noneMatch(LocationResponse::popular);
        assertThat(search("", 1)).hasSize(1);
        assertThat(search("", 50)).hasSize(50);
    }

    @Test
    void searchFindsOtherAreasByCaseInsensitiveTrimmedSubstring() {
        assertThat(search("  rEd dEe  ", 20)).containsExactly(
                new LocationResponse("ab-3", "Red Deer", "ab", "Alberta", false));
        assertThat(search("location that does not exist", 20)).isEmpty();
    }

    @Test
    void searchAlsoMatchesProvinceLabelsButOnlyReturnsAreas() {
        assertThat(search("mAnItObA", 50))
                .hasSize(14)
                .allSatisfy(area -> assertThat(area.provinceId()).isEqualTo("mb"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"%", "_"})
    void searchTreatsQueryAsLiteralText(String query) {
        assertThat(search(query, 20)).isEmpty();
    }

    @Test
    void searchReflectsNewDatabaseAreasAndExcludesDisabledAreasAndProvinces() {
        Location province = province("search-fixture-province", "Search fixture province");
        Location hiddenProvince = province("search-fixture-hidden", "Search fixture hidden province");
        hiddenProvince.setEnabled(false);
        locations.save(hiddenProvince);
        Location visibleArea = area("search-fixture-visible", "Freshly added town", province, 1, false);
        Location hiddenArea = area("search-fixture-disabled", "Disabled town", province, 2, true);
        hiddenArea.setEnabled(false);
        locations.save(hiddenArea);
        area("search-fixture-child", "Hidden province town", hiddenProvince, 1, true);

        assertThat(search("search fixture", 50)).extracting(LocationResponse::id)
                .containsExactly(visibleArea.getId());
        assertThat(search("freshly added", 20)).containsExactly(new LocationResponse(
                visibleArea.getId(), "Freshly added town", province.getId(), province.getLabel(), false));

        visibleArea.setEnabled(false);
        locations.save(visibleArea);
        assertThat(search("freshly added", 20)).isEmpty();
    }

    @Test
    void searchOrdersByPopularityThenDisplayOrderLabelAndIdBeforeLimiting() {
        Location province = province("search-fixture-province", "Search fixture province");
        area("search-fixture-first", "Z town", province, 1, true);
        area("search-fixture-tie-b", "A town", province, 2, true);
        area("search-fixture-tie-a", "A town", province, 2, true);
        area("search-fixture-last", "Z town", province, 0, false);
        area("search-fixture-normal", "A town", province, 0, false);

        assertThat(search("search fixture", 50)).extracting(LocationResponse::id).containsExactly(
                "search-fixture-first", "search-fixture-tie-a", "search-fixture-tie-b",
                "search-fixture-normal", "search-fixture-last");
        assertThat(search("search fixture", 2)).extracting(LocationResponse::id).containsExactly(
                "search-fixture-first", "search-fixture-tie-a");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "51", "not-a-number"})
    void searchRejectsInvalidLimits(String limit) {
        ResponseEntity<Map> response = rest.getForEntity(
                url("/api/v1/locations/search?limit=" + limit), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void searchRejectsOverlongQueries() {
        ResponseEntity<Map> response = rest.getForEntity(
                url("/api/v1/locations/search?q=" + "a".repeat(121)), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).containsEntry("code", "VALIDATION_ERROR");
    }

    private LocationResponse[] search(String query, int limit) {
        ResponseEntity<LocationResponse[]> response = rest.getForEntity(
                url("/api/v1/locations/search?q={query}&limit={limit}"), LocationResponse[].class, query, limit);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private CategoryResponse[] publicCategories(SiteScope site) {
        ResponseEntity<CategoryResponse[]> response = rest.getForEntity(
                url("/api/v1/categories?site={site}"), CategoryResponse[].class, site);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getCacheControl()).contains("no-cache");
        return response.getBody();
    }

    private Category category(String id, String label, SiteScope site) {
        fixtureCategoryIds.add(id);
        return categories.save(new Category(id, label, "Tag", site, false, 100));
    }

    private Location province(String id, String label) {
        fixtureProvinceIds.add(id);
        return locations.save(new Location(id, label, LocationType.PROVINCE, null, 100, false));
    }

    private Location area(String id, String label, Location province, int order, boolean popular) {
        fixtureAreaIds.add(id);
        return locations.save(new Location(id, label, LocationType.AREA, province, order, popular));
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
