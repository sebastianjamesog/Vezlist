package cc.vezlist.discovery.web;

import java.util.List;

import cc.vezlist.discovery.application.DiscoveryService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/listings")
public class DiscoveryController {
    private final DiscoveryService discovery;

    public DiscoveryController(DiscoveryService discovery) {
        this.discovery = discovery;
    }

    @Operation(summary = "Search active listings with stable cursor pagination")
    @GetMapping
    public DiscoveryPageResponse search(
            @Valid @ParameterObject @ModelAttribute DiscoverySearchRequest request) {
        return discovery.search(request);
    }

    @Operation(summary = "Get the lightweight active-listing map projection")
    @GetMapping("/map")
    public List<DiscoveryMapPinResponse> mapPins(
            @Valid @ParameterObject @ModelAttribute DiscoveryMapRequest request) {
        return discovery.mapPins(request);
    }
}
