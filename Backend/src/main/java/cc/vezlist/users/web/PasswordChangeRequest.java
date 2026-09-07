package cc.vezlist.users.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PasswordChangeRequest(
        @NotBlank(message = "Current password is required.") String currentPassword,

        @NotBlank(message = "New password is required.")
        @Size(min = 8, max = 72, message = "New password must contain 8-72 characters.")
        @Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9\\W]).+$",
                message = "New password must include upper and lower case letters and a number or symbol.")
        String newPassword) {

    @Override
    public String toString() {
        return "PasswordChangeRequest[currentPassword=[REDACTED], newPassword=[REDACTED]]";
    }
}
