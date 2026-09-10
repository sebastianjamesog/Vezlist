package cc.vezlist.media.web;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record MediaOrderRequest(
        @NotNull @Size(min = 1, max = 6) List<@NotNull UUID> mediaIds,
        @NotNull UUID coverMediaId) {
}
