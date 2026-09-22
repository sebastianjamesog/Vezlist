import { api } from "./client.js";
import { sha256Hex } from "./media.js";

/**
 * Owner-facing per-listing ad verification, over
 * `cc.vezlist.verification.web.VerificationController`: request a 6-digit
 * code, upload a photo of the seller holding it, poll for the outcome.
 *
 * Deliberately its own module rather than an addition to `media.js`/
 * `listings.js` — verification is a different backend concept (its own
 * table, its own controller) with only the upload *shape* in common with
 * listing photo uploads, and those two files belong to other work.
 */

/**
 * POST /api/v1/listings/{listingId}/verification -> VerificationRequestResponse.
 * 409 VERIFICATION_CONFLICT if the listing isn't PENDING_REVIEW/ACTIVE, or a
 * request is already open on it.
 */
export function requestVerification(listingId) {
  return api.post(`/api/v1/listings/${listingId}/verification`);
}

/**
 * GET /api/v1/listings/{listingId}/verification -> VerificationRequestResponse.
 * 404 VERIFICATION_REQUEST_NOT_FOUND if none exists yet.
 */
export function currentVerification(listingId) {
  return api.get(`/api/v1/listings/${listingId}/verification`);
}

/** POST .../verification/{requestId}/photo/upload-url -> VerificationUploadAuthorizationResponse. */
export function authorizeVerificationUpload(listingId, requestId, request) {
  return api.post(
    `/api/v1/listings/${listingId}/verification/${requestId}/photo/upload-url`,
    request,
  );
}

/** POST .../verification/{requestId}/photo/complete -> VerificationRequestResponse. `photoStatus` is "PROCESSING" immediately; the caller polls `currentVerification` for the async outcome. */
export function completeVerificationUpload(listingId, requestId) {
  return api.post(`/api/v1/listings/${listingId}/verification/${requestId}/photo/complete`);
}

/**
 * The whole photo-upload leg of the flow, from bytes to a "PROCESSING"
 * `VerificationRequestResponse`: checksum, authorize, PUT the bytes straight
 * to object storage (skipped when the backend already has this exact upload
 * — `alreadyUploaded`, its dedupe-by-checksum path), then mark it complete.
 * Mirrors `media.js`'s `uploadListingImage` — same pipeline, verification's
 * own endpoints.
 */
export async function uploadVerificationPhoto(listingId, requestId, blob, fileName) {
  const buffer = await blob.arrayBuffer();
  const checksumSha256 = await sha256Hex(buffer);
  const auth = await authorizeVerificationUpload(listingId, requestId, {
    fileName,
    contentType: blob.type || "image/jpeg",
    sizeBytes: blob.size,
    checksumSha256,
  });

  if (!auth.alreadyUploaded) {
    const headers = new Headers(auth.requiredHeaders || {});
    const response = await fetch(auth.uploadUrl, {
      method: "PUT",
      headers,
      body: blob,
    });
    if (!response.ok) {
      throw new Error(`Uploading "${fileName}" failed. Try again.`);
    }
  }

  return completeVerificationUpload(listingId, requestId);
}
