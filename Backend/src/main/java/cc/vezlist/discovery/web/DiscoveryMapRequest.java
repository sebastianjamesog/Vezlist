package cc.vezlist.discovery.web;

import java.math.BigDecimal;
import java.util.List;

import cc.vezlist.discovery.domain.PostedWithin;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DiscoveryMapRequest(
        @NotNull SiteScope site,
        @Size(max = 100) String q,
        @Size(max = 10) List<@Size(max = 80) String> category,
        @Size(max = 40) String province,
        @Size(max = 20) List<@Size(max = 40) String> area,
        @DecimalMin("0.00") BigDecimal minPrice,
        @DecimalMin("0.00") BigDecimal maxPrice,
        Boolean verifiedOnly,
        PostedWithin postedWithin,
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @DecimalMax("100.0") Double radiusKm,
        @Min(1) @Max(500) Integer limit) {
}
