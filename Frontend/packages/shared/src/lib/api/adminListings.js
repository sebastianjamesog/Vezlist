import { api } from "./client.js";

/**
 * Admin console: listings administration — an admin-scoped browse across
 * every listing regardless of owner, distinct from the owner-scoped
 * `ownedListings` in `listings.js`.
 *
 * Backed by `cc.vezlist.listings.web.AdminListingController`
 * (MODERATOR/ADMIN for browse+detail, ADMIN-only for remove).
 */

/**
 * GET /api/v1/admin/listings?site=&status=&query=&cursor=&limit=
 * -> { items: AdminListingSummaryResponse[], nextCursor, hasMore, totalCount }
 *
 * `site` and `status` are both optional server-side; `status` is the
 * backend's `ListingStatus` name (e.g. "ACTIVE", "PENDING_REVIEW").
 */
export function browseListings({ site, status, query, cursor, limit } = {}) {
  return api.get("/api/v1/admin/listings", { site, status, query, cursor, limit });
}

/**
 * GET /api/v1/admin/listings/{id}
 * -> { listing: ListingResponse, ownerId, ownerName, ownerEmail }
 */
export function adminListingDetail(id) {
  return api.get(`/api/v1/admin/listings/${id}`);
}

/**
 * POST /api/v1/admin/listings/{id}/remove -> AdminListingDetailResponse.
 *
 * ADMIN only. Allowed from ACTIVE or PENDING_REVIEW — the backend answers 409
 * (`LISTING_CONFLICT`) from any other status, which the caller should show
 * as an inline error rather than a crash.
 */
export function removeListing(id, reason) {
  return api.post(`/api/v1/admin/listings/${id}/remove`, { reason });
}
