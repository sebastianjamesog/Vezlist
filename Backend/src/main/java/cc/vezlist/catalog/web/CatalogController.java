package cc.vezlist.catalog.web;

import java.util.List;

import cc.vezlist.catalog.application.CatalogService;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {
    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping("/categories")
    ResponseEntity<List<CategoryResponse>> categories(
            @RequestParam(defaultValue = "MARKETPLACE") SiteScope site) {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(catalogService.categories(site));
    }

    @GetMapping("/locations")
    ResponseEntity<LocationsResponse> locations() {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(catalogService.locations());
    }

    @GetMapping("/locations/search")
    ResponseEntity<List<LocationResponse>> searchLocations(
            @RequestParam(defaultValue = "") @Size(max = 120) String q,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(catalogService.searchLocations(q, limit));
    }
}
