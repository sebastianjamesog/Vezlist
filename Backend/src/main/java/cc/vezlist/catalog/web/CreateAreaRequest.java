package cc.vezlist.catalog.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Only AREA locations can be created by admins; the province list is a fixed geographic reference. */
public record CreateAreaRequest(
        @NotBlank(message = "Label is required.") @Size(max = 120) String label,
        @NotBlank(message = "A parent province id is required.") @Size(max = 40) String provinceId,
        @Min(0) int displayOrder,
        boolean popular) {
}
