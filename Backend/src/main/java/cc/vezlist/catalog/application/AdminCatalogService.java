package cc.vezlist.catalog.application;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.catalog.domain.Category;
import cc.vezlist.catalog.domain.Location;
import cc.vezlist.catalog.domain.LocationType;
import cc.vezlist.catalog.persistence.AdminCatalogRepository;
import cc.vezlist.catalog.persistence.CategoryRepository;
import cc.vezlist.catalog.persistence.LocationRepository;
import cc.vezlist.catalog.web.AdminCategoryResponse;
import cc.vezlist.catalog.web.AdminLocationResponse;
import cc.vezlist.catalog.web.CreateAreaRequest;
import cc.vezlist.catalog.web.CreateCategoryRequest;
import cc.vezlist.catalog.web.CreateProvinceRequest;
import cc.vezlist.catalog.web.UpdateCategoryRequest;
import cc.vezlist.catalog.web.UpdateLocationRequest;
import cc.vezlist.shared.domain.SiteScope;

/** Admin CRUD for taxonomy (categories, provinces/areas). Public catalog reads stay in {@code CatalogService}. */
@Service
public class AdminCatalogService {
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

    private final CategoryRepository categories;
    private final LocationRepository locations;
    private final AdminCatalogRepository referenceChecks;
    private final AdminAuditService audit;

    public AdminCatalogService(
            CategoryRepository categories,
            LocationRepository locations,
            AdminCatalogRepository referenceChecks,
            AdminAuditService audit) {
        this.categories = categories;
        this.locations = locations;
        this.referenceChecks = referenceChecks;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<AdminCategoryResponse> listCategories(SiteScope site) {
        List<Category> found = site == null ? categories.findAll() : categories.findBySiteScope(site);
        return found.stream()
                .sorted(java.util.Comparator.comparing(Category::getDisplayOrder).thenComparing(Category::getLabel))
                .map(AdminCategoryResponse::from)
                .toList();
    }

    /** Normalize tied orders and reorder one board atomically, without altering the other board. */
    @Transactional
    public List<AdminCategoryResponse> moveCategory(UUID actorId, String id, int direction) {
        if (direction != -1 && direction != 1) throw new IllegalArgumentException("Direction must be -1 or 1.");
        Category target = categories.findById(id)
                .orElseThrow(() -> new CatalogNotFoundException("Category was not found."));
        var ordered = new java.util.ArrayList<>(categories.lockSite(target.getSiteScope()));
        ordered.sort(java.util.Comparator.comparing(Category::getDisplayOrder).thenComparing(Category::getLabel).thenComparing(Category::getId));
        int index = java.util.stream.IntStream.range(0, ordered.size())
                .filter(i -> ordered.get(i).getId().equals(id)).findFirst().orElseThrow();
        int next = index + direction;
        if (next >= 0 && next < ordered.size()) {
            java.util.Collections.swap(ordered, index, next);
            for (int i = 0; i < ordered.size(); i++) {
                var item = ordered.get(i);
                item.update(item.getLabel(), item.getIcon(), item.isPrimary(), i);
            }
            audit.record(actorId, "CATEGORY_REORDERED", "CATEGORY", id, "Moved within " + target.getSiteScope());
        }
        return ordered.stream().map(AdminCategoryResponse::from).toList();
    }

    @Transactional
    public AdminCategoryResponse createCategory(UUID actorId, CreateCategoryRequest request) {
        String id = slug(request.label());
        if (categories.existsById(id)) {
            throw new CatalogAlreadyExistsException("A category with a similar name already exists (id: " + id + ").");
        }
        Category category = new Category(
                id, request.label().trim(), request.icon().trim(), request.site(), request.primary(),
                request.displayOrder());
        categories.save(category);
        audit.record(actorId, "CATEGORY_CREATED", "CATEGORY", id, request.label());
        return AdminCategoryResponse.from(category);
    }

    @Transactional
    public AdminCategoryResponse updateCategory(UUID actorId, String id, UpdateCategoryRequest request) {
        Category category = categories.findById(id)
                .orElseThrow(() -> new CatalogNotFoundException("Category '" + id + "' was not found."));
        category.update(request.label().trim(), request.icon().trim(), request.primary(), request.displayOrder());
        category.setEnabled(request.enabled());
        audit.record(actorId, "CATEGORY_UPDATED", "CATEGORY", id, request.label());
        return AdminCategoryResponse.from(category);
    }

    @Transactional
    public void deleteCategory(UUID actorId, String id) {
        Category category = categories.findById(id)
                .orElseThrow(() -> new CatalogNotFoundException("Category '" + id + "' was not found."));
        long referencing = referenceChecks.activeListingsReferencingCategory(id);
        if (referencing > 0) {
            throw new CatalogInUseException(
                    "Cannot delete category '" + id + "': " + referencing + " listing(s) still reference it.");
        }
        categories.delete(category);
        audit.record(actorId, "CATEGORY_DELETED", "CATEGORY", id, category.getLabel());
    }

    @Transactional(readOnly = true)
    public List<AdminLocationResponse> listLocations(String provinceId) {
        List<Location> found = locations.findAll();
        return found.stream()
                .filter(location -> provinceId == null
                        || location.getId().equals(provinceId)
                        || (location.getParent() != null && location.getParent().getId().equals(provinceId)))
                .sorted(java.util.Comparator.comparing(Location::getDisplayOrder).thenComparing(Location::getLabel))
                .map(AdminLocationResponse::from)
                .toList();
    }

    @Transactional
    public AdminLocationResponse createProvince(UUID actorId, CreateProvinceRequest request) {
        String id = slug(request.label());
        if (locations.existsById(id)) {
            throw new CatalogAlreadyExistsException("A province with a similar name already exists (id: " + id + ").");
        }
        Location province = new Location(id, request.label().trim(), LocationType.PROVINCE, null,
                request.displayOrder(), false);
        locations.save(province);
        audit.record(actorId, "PROVINCE_CREATED", "LOCATION", id, request.label());
        return AdminLocationResponse.from(province);
    }

    @Transactional
    public AdminLocationResponse createArea(UUID actorId, CreateAreaRequest request) {
        Location province = locations.findById(request.provinceId())
                .orElseThrow(() -> new CatalogNotFoundException("Province '" + request.provinceId() + "' was not found."));
        if (province.getType() != LocationType.PROVINCE) {
            throw new CatalogReferenceInvalidException("'" + request.provinceId() + "' is not a province.");
        }
        String id = boundedId(request.provinceId() + "-" + slug(request.label()));
        if (locations.existsById(id)) {
            throw new CatalogAlreadyExistsException("An area with a similar name already exists (id: " + id + ").");
        }
        Location area = new Location(id, request.label().trim(), LocationType.AREA, province,
                request.displayOrder(), request.popular());
        locations.save(area);
        audit.record(actorId, "AREA_CREATED", "LOCATION", id, request.label());
        return AdminLocationResponse.from(area);
    }

    @Transactional
    public AdminLocationResponse updateLocation(UUID actorId, String id, UpdateLocationRequest request) {
        Location location = locations.findById(id)
                .orElseThrow(() -> new CatalogNotFoundException("Location '" + id + "' was not found."));
        location.update(request.label().trim(), request.displayOrder(), request.popular());
        location.setEnabled(request.enabled());
        audit.record(actorId, "LOCATION_UPDATED", "LOCATION", id, request.label());
        return AdminLocationResponse.from(location);
    }

    @Transactional
    public void deleteArea(UUID actorId, String id) {
        Location location = locations.findById(id)
                .orElseThrow(() -> new CatalogNotFoundException("Location '" + id + "' was not found."));
        if (location.getType() == LocationType.PROVINCE) {
            boolean hasAreas = locations.findAll().stream()
                    .anyMatch(area -> area.getParent() != null && area.getParent().getId().equals(id));
            if (hasAreas) {
                throw new CatalogInUseException(
                        "Cannot delete province '" + id + "': it still has areas under it.");
            }
        }
        long referencing = referenceChecks.activeListingsReferencingLocation(id);
        if (referencing > 0) {
            throw new CatalogInUseException(
                    "Cannot delete " + location.getType().name().toLowerCase(Locale.ROOT) + " '" + id + "': "
                            + referencing + " listing(s) still reference it.");
        }
        locations.delete(location);
        audit.record(actorId, location.getType() + "_DELETED", "LOCATION", id, location.getLabel());
    }

    private String slug(String label) {
        String normalized = Normalizer.normalize(label, Normalizer.Form.NFD)
                .replaceAll("[\\p{InCombiningDiacriticalMarks}]", "")
                .toLowerCase(Locale.ROOT);
        String slug = NON_ALNUM.matcher(normalized).replaceAll("-").replaceAll("^-+|-+$", "");
        return boundedId(slug.isBlank() ? "category" : slug);
    }

    private String boundedId(String value) {
        if (value.length() <= 40) return value;
        String suffix = UUID.nameUUIDFromBytes(value.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                .toString().substring(0, 8);
        return value.substring(0, 31) + "-" + suffix;
    }
}
