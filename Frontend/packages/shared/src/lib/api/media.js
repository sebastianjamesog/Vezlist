import { api, ApiError, SITE_SCOPE } from "./client.js";

const PROCESSING_POLLS = 30;
const PROCESSING_POLL_MS = 1000;

function requireUsableMedia(media) {
  if (media?.status === "REJECTED") {
    throw new ApiError({
      status: 400,
      code: "MEDIA_REJECTED",
      message:
        media.rejectionReason ||
        "A photo was rejected. Replace it before publishing.",
    });
  }
  return media?.status === "READY";
}

async function waitForReadyMedia(listingId, mediaId, initial) {
  if (requireUsableMedia(initial)) return initial;
  for (let attempt = 0; attempt < PROCESSING_POLLS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
    const listing = await api.get(`/api/v1/listings/${listingId}`, {
      site: SITE_SCOPE,
    });
    const media = listing.media?.find((image) => image.id === mediaId);
    if (requireUsableMedia(media)) return media;
  }
  throw new ApiError({
    status: 408,
    code: "MEDIA_PROCESSING_TIMEOUT",
    message:
      "Photos are still processing. Your ad is saved as a draft in My Ads; try publishing it there shortly.",
  });
}

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
  const contentType =
    header.match(/data:(.*?)(;base64)?$/)?.[1] || "image/jpeg";
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
 * The whole photo-upload flow for one image, from bytes to a READY
 * `ListingMediaResponse`: checksum, authorize, PUT the bytes to
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

  // Direct publication must wait for the asynchronous image processor.
  const completed = await completeUpload(listingId, auth.mediaId);
  return waitForReadyMedia(listingId, auth.mediaId, completed);
}
