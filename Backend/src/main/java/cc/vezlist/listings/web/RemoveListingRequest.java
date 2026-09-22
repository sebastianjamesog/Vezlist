package cc.vezlist.listings.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RemoveListingRequest(
        @NotBlank(message = "A reason is required.")
        @Size(max = 80, message = "Reason must be at most 80 characters.")
        String reason) {
}
