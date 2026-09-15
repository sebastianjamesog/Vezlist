const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Sign-in and sign-up share a form, so they share a validator: `mode` decides
 * which fields have to be there.
 */
export function validateAuth(values, mode = "signin") {
  const errors = {};

  if (mode === "signup" && values.name.trim().length < 2) {
    errors.name = "Enter your name.";
  }
  if (!EMAIL.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (values.password.length < 8) {
    errors.password = "Passwords are at least 8 characters.";
  }
  if (mode === "signup" && !values.accepted) {
    errors.accepted = "Accept the terms to continue.";
  }

  return errors;
}
