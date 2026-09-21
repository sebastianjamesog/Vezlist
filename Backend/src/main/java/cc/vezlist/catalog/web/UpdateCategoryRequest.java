package cc.vezlist.catalog.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateCategoryRequest(
        @NotBlank(message = "Label is required.") @Size(max = 120) String label,
        @NotBlank(message = "Icon is required.") @Size(max = 80) String icon,
        boolean primary,
        @Min(0) int displayOrder,
        boolean enabled) {
}
