import { api } from "./client.js";

/**
 * Admin console: the staff side of moderation, over
 * `cc.vezlist.moderation.web.StaffModerationController`. MODERATOR/ADMIN
 * only. Distinct from `moderation.js`, which wraps the public/owner-facing
 * pieces of `ModerationController` (report-this-ad, owner status, appeal) —
 * this file is the reviewer's queue and decisions on top of the same cases.
 *
 * A case's `kind` (`"SUBMISSION" | "REPORT" | "APPEAL"`) is what the queue
 * rows and the case detail carry to tell a plain pending-review submission
 * apart from a member's report or an owner's appeal — the backend has one
 * queue, not three, so screens filter/tag by `kind` client-side rather than
 * hitting three endpoints.
 */

/**
 * GET /api/v1/moderation/cases?site=&limit=&offset= -> raw case rows
 * (`{id, listing_id, kind, assigned_to, created_at, site_scope, title,
 * category_id, listing_status}`), oldest-open-first.
 *
 * `site` is required by the backend (no "both sites" query) — callers
 * wanting every site issue one call per `SiteScope` and merge.
 */
export function queueCases({ site, limit, offset } = {}) {
  return api.get("/api/v1/moderation/cases", { site, limit, offset });
}

/**
 * GET /api/v1/moderation/cases/{id} -> `{review, listing, policy, media,
 * mediaReviews, reports, actions}`. `reports` is the report rows filed
 * against this case (reason/details/created_at) — empty for a SUBMISSION or
 * APPEAL case. `actions` is the full action history, newest first.
 */
export function caseDetail(id) {
  return api.get(`/api/v1/moderation/cases/${id}`);
}

/** POST /api/v1/moderation/cases/{id}/assignment -> Receipt. Claim (or hand off) a case before deciding it. */
export function assignCase(id, assigneeId) {
  return api.post(`/api/v1/moderation/cases/${id}/assignment`, { assigneeId });
}

/** POST /api/v1/moderation/cases/{id}/notes -> Receipt. An internal note, not shown to the member. */
export function noteCase(id, message) {
  return api.post(`/api/v1/moderation/cases/${id}/notes`, { message });
}

/** POST /api/v1/moderation/cases/{id}/media-reviews -> Receipt. `{mediaId, verdict: "PASS"|"BLOCK", note}`. */
export function reviewCaseMedia(id, { mediaId, verdict, note }) {
  return api.post(`/api/v1/moderation/cases/${id}/media-reviews`, { mediaId, verdict, note });
}

/**
 * POST /api/v1/moderation/cases/{id}/decisions -> `{id, listingStatus, caseStatus, approvals}`.
 * `{decision: "APPROVE"|"REJECT"|"REMOVE"|"DISMISS", reason, note, eligibilityChecked}`.
 *
 * `reason` is one of the backend's `PublicReason` enum values, required for
 * REJECT/REMOVE and ignored otherwise. The caller must have claimed the case
 * (via `assignCase`) first — the backend answers 409 ("Claim this case
 * before reviewing it.") if not.
 */
export function decideCase(id, { decision, reason, note, eligibilityChecked = false }) {
  return api.post(`/api/v1/moderation/cases/${id}/decisions`, {
    decision,
    reason,
    note,
    eligibilityChecked,
  });
}
