package cc.vezlist.admin.web;

import jakarta.validation.constraints.*;

public record AdminSettingsRequest(
        @NotBlank @Size(max = 160) String ageGateTitle,
        @NotBlank @Size(max = 2000) String ageGateBody,
        @NotNull @Min(1) @Max(72) Integer reviewSlaHours,
        @NotNull @Min(1) @Max(168) Integer reportSlaHours,
        @NotNull @Min(1) @Max(168) Integer ticketSlaHours,
        @NotNull @Min(0) Long version) { }
