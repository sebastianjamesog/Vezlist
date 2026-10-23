import { api } from "./client.js";

/**
 * Staff review queue for per-listing ad verification, over
 * `cc.vezlist.verification.web.StaffVerificationController`. MODERATOR/ADMIN
 * only. Distinct from `adminModeration.js`'s report/appeal/submission case
 * queue — verification requests are a separate backend concept (their own
 * table, their own endpoints), not a case `kind`.
 */

/** GET /api/v1/moderation/verification-requests?site=&limit=&offset= -> VerificationQueueItemResponse[]. */
export function queueVerifications({ site, limit, offset } = {}) {
  return api.get("/api/v1/moderation/verification-requests", { site, limit, offset });
}

/**
 * GET /api/v1/moderation/verification-requests/{id} -> VerificationDetailResponse
 * (adds `status`, `photoUrl` — a presigned download, present once the photo
 * is READY — `rejectionReason`, `decidedAt`, `createdAt`).
 */
export function verificationDetail(id) {
  return api.get(`/api/v1/moderation/verification-requests/${id}`);
}

/**
 * POST /api/v1/moderation/verification-requests/{id}/decisions -> VerificationRequestResponse.
 * `{decision: "APPROVE"|"REJECT", reason, verifiedMediaIds?: UUID[]}` — `reason` required for REJECT
 * (400 otherwise). Sets `listings.verified = true` on APPROVE. A staff
 * member reviewing their own listing gets a 403. Only explicitly selected ready
 * listing photos receive photo verification; omission verifies no pictures.
 */
export function decideVerification(id, { decision, reason, verifiedMediaIds }) {
  return api.post(`/api/v1/moderation/verification-requests/${id}/decisions`, {
    decision,
    reason,
    verifiedMediaIds,
  });
}
