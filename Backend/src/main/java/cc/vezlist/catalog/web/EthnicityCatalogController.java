package cc.vezlist.catalog.web;

import java.util.List;
import cc.vezlist.catalog.application.EthnicityCatalogService;
import cc.vezlist.catalog.application.EthnicityCatalogService.Option;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EthnicityCatalogController {
    private final EthnicityCatalogService ethnicities;
    public EthnicityCatalogController(EthnicityCatalogService ethnicities) { this.ethnicities = ethnicities; }
    @GetMapping("/api/v1/ethnicities")
    public ResponseEntity<List<Option>> active() {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(ethnicities.active());
    }
}
