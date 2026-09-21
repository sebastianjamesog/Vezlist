package cc.vezlist.catalog.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Creates an AREA under an existing province. See {@link CreateProvinceRequest} to add a province itself. */
public record CreateAreaRequest(
        @NotBlank(message = "Label is required.") @Size(max = 120) String label,
        @NotBlank(message = "A parent province id is required.") @Size(max = 40) String provinceId,
        @Min(0) int displayOrder,
        boolean popular) {
}
