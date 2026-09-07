package cc.vezlist.users.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ProfileUpdateRequest(
        @NotBlank(message = "Name is required.")
        @Size(min = 2, max = 100, message = "Name must contain 2-100 characters.")
        String name,

        @NotBlank(message = "Email is required.")
        @Email(message = "Enter a valid email address.")
        @Size(max = 320, message = "Email is too long.")
        String email,

        @Pattern(regexp = "^$|^\\+?[0-9 ()-]{7,25}$", message = "Enter a valid phone number.")
        String phone,

        @Size(max = 150, message = "Location must be at most 150 characters.")
        String location,

        @Size(max = 200, message = "Bio must be at most 200 characters.")
        String bio) {
}
