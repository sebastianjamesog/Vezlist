import { api } from "./client.js";

/**
 * GET /api/v1/me/profile -> UserProfileDetails
 * ({id, name, email, phone, location, bio, avatarUrl, emailVerified, memberSince, updatedAt}).
 */
export function getProfile() {
  return api.get("/api/v1/me/profile");
}

/**
 * PATCH /api/v1/me/profile -> UserProfileDetails.
 *
 * Changing name/email makes the backend replace this session's principal
 * (UserProfileController#updateProfile), so callers should follow a
 * successful call with AuthContext's `refreshUser()` rather than trusting
 * the cached `user` to still match.
 */
export function updateProfile({ name, email, phone, location, bio }) {
  return api.patch("/api/v1/me/profile", { name, email, phone, location, bio });
}

/** GET /api/v1/me/preferences -> UserPreferenceDetails. */
export function getPreferences() {
  return api.get("/api/v1/me/preferences");
}

/** PATCH /api/v1/me/preferences -> UserPreferenceDetails. All four fields are required by the backend. */
export function updatePreferences({ pushNotifications, emailUpdates, showPhoneOnAds, preciseLocation, availableNow }) {
  return api.patch("/api/v1/me/preferences", {
    pushNotifications,
    emailUpdates,
    showPhoneOnAds,
    preciseLocation,
    availableNow,
  });
}

/**
 * PATCH /api/v1/me/password -> 204.
 *
 * Revokes the account's other sessions and replaces this session's
 * principal (UserProfileController#changePassword), so callers should
 * follow a successful call with `refreshUser()`.
 */
export function changePassword({ currentPassword, newPassword }) {
  return api.patch("/api/v1/me/password", { currentPassword, newPassword });
}

/** DELETE /api/v1/me -> 202 + DeletionRequestDetails ({requestId, status, requestedAt}). */
export function requestDeletion() {
  return api.delete("/api/v1/me");
}
