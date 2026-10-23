package cc.vezlist.catalog.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateNeighbourhoodRequest(
        @NotBlank @Size(max = 120) String label,
        @NotBlank @Size(max = 40) String areaId,
        @Min(0) int displayOrder,
        boolean popular) {}
