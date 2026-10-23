package cc.vezlist.listings.web;

import java.math.BigDecimal;
import java.util.Map;

import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ListingWriteRequest(
        @NotNull SiteScope site,
        @NotBlank @Size(min = 4, max = 70) String title,
        @NotBlank @Size(max = 120) String businessName,
        @NotBlank @Size(min = 20, max = 5000) String description,
        @DecimalMin("0.00") @DecimalMax("9999.00") @Digits(integer = 4, fraction = 2) BigDecimal price,
        @NotBlank @Size(max = 80) String categoryId,
        @NotBlank @Size(max = 40) String provinceId,
        @NotBlank @Size(max = 40) String locationId,
        @NotBlank @Email @Size(max = 320) String contactEmail,
        @NotBlank @Pattern(regexp = "^[+()0-9 .-]{7,32}$") String contactPhone,
        @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
        @Size(max = 30) Map<@Size(max = 80) String, @Size(max = 500) String> attributes) {

    public Map<String, String> safeAttributes() {
        return attributes == null ? Map.of() : attributes;
    }
}
