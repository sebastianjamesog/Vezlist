package cc.vezlist.identity.web;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "Name is required.")
        @Size(max = 100, message = "Name must be at most 100 characters.")
        String name,
        @NotBlank(message = "Email is required.")
        @Email(message = "Enter a valid email address.")
        @Size(max = 320, message = "Email must be at most 320 characters.")
        String email,
        @NotBlank(message = "Password is required.")
        @Size(min = 8, max = 72, message = "Password must be 8-72 characters.")
        String password,
        @AssertTrue(message = "You must accept the terms of service and privacy policy.")
        boolean acceptedTerms) {

    @Override
    public String toString() {
        return "RegisterRequest[name=" + name + ", email=" + email
                + ", password=[REDACTED], acceptedTerms=" + acceptedTerms + "]";
    }
}
