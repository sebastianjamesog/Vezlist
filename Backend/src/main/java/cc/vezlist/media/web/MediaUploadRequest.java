package cc.vezlist.media.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record MediaUploadRequest(
        @NotBlank @Size(max = 255) String fileName,
        @NotBlank @Pattern(regexp = "^image/(jpeg|png|webp)$") String contentType,
        @Positive long sizeBytes,
        @NotBlank @Pattern(regexp = "^[A-Fa-f0-9]{64}$") String checksumSha256) {
}
