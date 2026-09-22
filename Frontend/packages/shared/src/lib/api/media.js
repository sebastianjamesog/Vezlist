import { api } from "./client.js";

/**
 * Listing photo upload: get a presigned URL, PUT the bytes straight to
 * object storage, then tell the backend the upload finished.
 *
 * `authorizeUpload` returns `uploadUrl` + `requiredHeaders` (see
 * `MediaUploadAuthorizationResponse`/`S3ObjectStorage.browserHeaders` on the
 * backend) — a direct-to-MinIO presigned PUT, not our API, so it carries no
 * session cookie and no CSRF header, only whichever headers the presign
 * actually signed (Content-Type and the sha256 metadata header, notably —
 * sending anything other than exactly those signed values fails the
 * signature check).
 */

/** POST /api/v1/listings/{listingId}/media/upload-url -> MediaUploadAuthorizationResponse. */
export function authorizeUpload(listingId, request) {
  return api.post(`/api/v1/listings/${listingId}/media/upload-url`, request);
}

/** POST /api/v1/listings/{listingId}/media/{mediaId}/complete -> ListingMediaResponse. */
export function completeUpload(listingId, mediaId) {
  return api.post(`/api/v1/listings/${listingId}/media/${mediaId}/complete`);
}

/** PATCH /api/v1/listings/{listingId}/media/order -> ListingMediaResponse[]. */
export function reorderMedia(listingId, request) {
  return api.patch(`/api/v1/listings/${listingId}/media/order`, request);
}

/** DELETE /api/v1/listings/{listingId}/media/{mediaId} -> 204. */
export function deleteMedia(listingId, mediaId) {
  return api.delete(`/api/v1/listings/${listingId}/media/${mediaId}`);
}

/** A `data:` URI (what `adDraft`'s images already are) as a `Blob`. */
export function dataUriToBlob(dataUri) {
  const [header, base64] = dataUri.split(",");
  const contentType = header.match(/data:(.*?)(;base64)?$/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

/** Lowercase hex SHA-256 of an `ArrayBuffer` — what `MediaUploadRequest.checksumSha256` wants. */
export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The whole photo-upload flow for one image, from bytes to a READY (or
 * PROCESSING) `ListingMediaResponse`: checksum, authorize, PUT the bytes to
 * storage (skipped when the backend already has this exact upload —
 * `alreadyUploaded`, its dedupe-by-checksum path), then mark it complete.
 */
export async function uploadListingImage(listingId, blob, fileName) {
  const buffer = await blob.arrayBuffer();
  const checksumSha256 = await sha256Hex(buffer);
  const auth = await authorizeUpload(listingId, {
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

  return completeUpload(listingId, auth.mediaId);
}
