package cc.vezlist.catalog.application;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import cc.vezlist.catalog.domain.Category;
import cc.vezlist.catalog.domain.Location;
import cc.vezlist.catalog.domain.LocationType;
import cc.vezlist.catalog.persistence.CategoryRepository;
import cc.vezlist.catalog.persistence.LocationRepository;
import cc.vezlist.catalog.web.CategoryResponse;
import cc.vezlist.catalog.web.LocationResponse;
import cc.vezlist.catalog.web.LocationsResponse;
import cc.vezlist.catalog.web.ProvinceResponse;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CatalogService {
    private final CategoryRepository categoryRepository;
    private final LocationRepository locationRepository;

    public CatalogService(CategoryRepository categoryRepository, LocationRepository locationRepository) {
        this.categoryRepository = categoryRepository;
        this.locationRepository = locationRepository;
    }

    public List<CategoryResponse> categories(SiteScope site) {
        return categoryRepository.findBySiteScopeAndEnabledTrueOrderByDisplayOrderAscLabelAsc(site).stream()
                .map(CategoryResponse::from)
                .toList();
    }

    public LocationsResponse locations() {
        List<Location> locations = locationRepository.findByEnabledTrueOrderByDisplayOrderAscLabelAsc();
        Map<String, List<Location>> areasByProvince = locations.stream()
                .filter(location -> location.getType() == LocationType.AREA)
                .collect(Collectors.groupingBy(location -> location.getParent().getId()));

        List<ProvinceResponse> provinces = locations.stream()
                .filter(location -> location.getType() == LocationType.PROVINCE)
                .map(province -> new ProvinceResponse(
                        province.getId(),
                        province.getLabel(),
                        areasByProvince.getOrDefault(province.getId(), List.of()).stream()
                                .map(LocationResponse::from)
                                .toList()))
                .toList();

        List<LocationResponse> popularAreas = locations.stream()
                .filter(location -> location.getType() == LocationType.AREA && location.isPopular())
                .map(LocationResponse::from)
                .toList();
        return new LocationsResponse(provinces, popularAreas);
    }

    public List<LocationResponse> searchLocations(String query, int limit) {
        String normalizedQuery = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        return locationRepository.searchEnabledAreas(normalizedQuery, PageRequest.of(0, limit)).stream()
                .map(LocationResponse::from)
                .toList();
    }

    public void requireEnabledCategory(SiteScope site, String categoryId) {
        if (!categoryRepository.existsByIdAndSiteScopeAndEnabledTrue(categoryId, site)) {
            throw new CatalogReferenceInvalidException("Category is not available for " + site + ".");
        }
    }

    public void requireEnabledLocation(String provinceId, String areaId) {
        if (!locationRepository.existsEnabledAreaInProvince(provinceId, areaId)) {
            throw new CatalogReferenceInvalidException("Area does not belong to the selected province.");
        }
    }
}
