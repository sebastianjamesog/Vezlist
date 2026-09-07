package cc.vezlist.catalog.application;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cc.vezlist.catalog.persistence.CategoryRepository;
import cc.vezlist.catalog.persistence.LocationRepository;
import cc.vezlist.shared.domain.SiteScope;
import org.junit.jupiter.api.Test;

class CatalogServiceTest {

    private final CategoryRepository categories = mock(CategoryRepository.class);
    private final LocationRepository locations = mock(LocationRepository.class);
    private final CatalogService service = new CatalogService(categories, locations);

    @Test
    void rejectsCategoryOutsideRequestedSiteScope() {
        when(categories.existsByIdAndSiteScopeAndEnabledTrue("personals", SiteScope.MARKETPLACE))
                .thenReturn(false);

        assertThatThrownBy(() -> service.requireEnabledCategory(SiteScope.MARKETPLACE, "personals"))
                .isInstanceOf(CatalogReferenceInvalidException.class);
    }

    @Test
    void rejectsUnknownOrMismatchedLocation() {
        when(locations.existsEnabledAreaInProvince("on", "bc-1")).thenReturn(false);

        assertThatThrownBy(() -> service.requireEnabledLocation("on", "bc-1"))
                .isInstanceOf(CatalogReferenceInvalidException.class);
    }
}
