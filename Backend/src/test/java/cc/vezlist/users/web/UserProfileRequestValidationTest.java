package cc.vezlist.users.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class UserProfileRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void createValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void validProfileUpdateIsAccepted() {
        ProfileUpdateRequest request = new ProfileUpdateRequest(
                "Sarah Jenkins", "sarah@example.com", "+1 250 555 0134", "Victoria, BC", "About Sarah");

        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void invalidProfileFieldsAreRejected() {
        ProfileUpdateRequest request = new ProfileUpdateRequest(" ", "wrong", "12", "x".repeat(151), "x".repeat(201));

        Set<ConstraintViolation<ProfileUpdateRequest>> violations = validator.validate(request);

        assertThat(violations).extracting(violation -> violation.getPropertyPath().toString())
                .contains("name", "email", "phone", "location", "bio");
    }

    @Test
    void passwordRequiresAllStrengthRules() {
        PasswordChangeRequest request = new PasswordChangeRequest("current-password", "onlylowercase");

        assertThat(validator.validate(request)).extracting(violation -> violation.getPropertyPath().toString())
                .contains("newPassword");
    }

    @Test
    void everyPreferenceMustBeExplicitlyProvided() {
        PreferencesUpdateRequest request = new PreferencesUpdateRequest(true, null, true, false);

        assertThat(validator.validate(request)).extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("emailUpdates");
    }
}
