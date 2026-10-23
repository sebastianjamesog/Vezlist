import { api } from "./client.js";

/**
 * POST /api/v1/listings/{id}/reports -> Receipt (ModerationService.Receipt).
 * (cc.vezlist.moderation.web.ModerationController#report,
 * cc.vezlist.moderation.web.ModerationRequests.Report)
 *
 * Requires a session. Body is `{ site, reason, details }` — `reason` is one
 * of the backend's `ReportReason` enum values (a fixed, closed set the
 * server validates; there is no free-text reason, only `details`, capped at
 * 1000 chars and optional).
 *
 * This is the only piece of `ModerationController` this module wraps —
 * appeals and the owner-status endpoint belong to the ad-management flow
 * another agent owns, not the public report-this-ad button.
 */
export function reportListing(listingId, { site, reason, details }) {
  return api.post(`/api/v1/listings/${listingId}/reports`, { site, reason, details });
}

/**
 * The owner's-eye view of moderation, for My Ads: where a listing stands and
 * whether it can be appealed.
 * (cc.vezlist.moderation.web.ModerationController#status/#appeal,
 * cc.vezlist.moderation.application.ModerationService.OwnerStatus)
 */

/** GET /api/v1/me/listings/{id}/moderation?site= -> { listingId, status, publicReason, appealAllowed, appealId, appealStatus, appealSubmittedAt, appealDecidedAt }. */
export function ownerStatus(listingId, site) {
  return api.get(`/api/v1/me/listings/${listingId}/moderation`, { site });
}

/** POST /api/v1/me/listings/{id}/moderation/appeals -> Receipt. */
export function appeal(listingId, { site, message }) {
  return api.post(`/api/v1/me/listings/${listingId}/moderation/appeals`, {
    site,
    message,
  });
}
