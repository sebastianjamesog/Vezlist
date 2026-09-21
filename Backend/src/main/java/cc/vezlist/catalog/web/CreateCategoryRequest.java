package cc.vezlist.catalog.web;

import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateCategoryRequest(
        @NotBlank(message = "Label is required.") @Size(max = 120) String label,
        @NotBlank(message = "Icon is required.") @Size(max = 80) String icon,
        @NotNull(message = "Site is required.") SiteScope site,
        boolean primary,
        @Min(0) int displayOrder) {
}
