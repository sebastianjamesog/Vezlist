package cc.vezlist.catalog.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateLocationRequest(
        @NotBlank(message = "Label is required.") @Size(max = 120) String label,
        @Min(0) int displayOrder,
        boolean popular,
        boolean enabled) {
}
