package cc.vezlist.catalog.web;

import java.time.Duration;
import java.util.List;

import cc.vezlist.catalog.application.CatalogService;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {
    private static final CacheControl PUBLIC_CACHE = CacheControl.maxAge(Duration.ofHours(1)).cachePublic();
    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping("/categories")
    ResponseEntity<List<CategoryResponse>> categories(
            @RequestParam(defaultValue = "MARKETPLACE") SiteScope site) {
        return ResponseEntity.ok().cacheControl(PUBLIC_CACHE).body(catalogService.categories(site));
    }

    @GetMapping("/locations")
    ResponseEntity<LocationsResponse> locations() {
        return ResponseEntity.ok().cacheControl(PUBLIC_CACHE).body(catalogService.locations());
    }
}
