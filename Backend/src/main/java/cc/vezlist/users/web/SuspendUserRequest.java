package cc.vezlist.users.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SuspendUserRequest(
        @NotBlank(message = "A reason is required.")
        @Size(max = 200, message = "Reason must be at most 200 characters.")
        String reason) {
}
