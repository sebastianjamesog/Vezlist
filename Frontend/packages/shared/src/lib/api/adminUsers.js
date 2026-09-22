import { api } from "./client.js";

/**
 * Admin console: user management (`cc.vezlist.users.web.AdminUserController`).
 * MODERATOR and ADMIN can read; only ADMIN may suspend/reinstate.
 */

/**
 * GET /api/v1/admin/users -> AdminUserPageResponse
 * ({items:[AdminUserSummary], nextCursor, hasMore, totalCount}).
 *
 * AdminUserSummary: {id, displayName, email, roles[], enabled, emailVerified,
 * createdAt, listingCount}.
 *
 * `cursor` is the opaque `nextCursor` from a previous page — omit for the
 * first page. `limit` defaults to 25 server-side, max 100.
 */
export function listAdminUsers({ query, cursor, limit } = {}) {
  return api.get("/api/v1/admin/users", { query, cursor, limit });
}

/**
 * GET /api/v1/admin/users/{id} -> AdminUserDetailResponse. Adds `suspendedAt`,
 * `suspensionReason`, `activeListingCount` on top of the summary shape.
 *
 * Throws ApiError with code ADMIN_USER_NOT_FOUND (404) if the id is unknown.
 */
export function getAdminUser(id) {
  return api.get(`/api/v1/admin/users/${id}`);
}

/**
 * POST /api/v1/admin/users/{id}/suspend {reason} -> AdminUserDetailResponse.
 * ADMIN only (403 FORBIDDEN otherwise).
 *
 * `reason` is required (1-200 chars) — a blank one throws ApiError with code
 * VALIDATION_ERROR (400). Suspending your own account, or one that no longer
 * exists, throws ApiError with code ADMIN_ACTION_CONFLICT (409) or
 * ADMIN_USER_NOT_FOUND (404) respectively. Suspending an already-suspended
 * account succeeds idempotently (200, original suspension untouched).
 */
export function suspendAdminUser(id, reason) {
  return api.post(`/api/v1/admin/users/${id}/suspend`, { reason });
}

/**
 * POST /api/v1/admin/users/{id}/reinstate -> AdminUserDetailResponse.
 * ADMIN only (403 FORBIDDEN otherwise). Idempotent: reinstating an
 * already-active account is a 200 no-op. 404 ADMIN_USER_NOT_FOUND if unknown.
 */
export function reinstateAdminUser(id) {
  return api.post(`/api/v1/admin/users/${id}/reinstate`);
}
