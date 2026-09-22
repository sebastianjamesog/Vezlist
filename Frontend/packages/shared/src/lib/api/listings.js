import { api, ApiError, SITE_SCOPE } from "./client.js";
import { dataUriToBlob, uploadListingImage } from "./media.js";
import {
  hasSelectedCategory,
  hasSelectedLocation,
  SELECT_CATEGORY_MESSAGE,
  SELECT_LOCATION_MESSAGE,
  toListingWriteRequest,
} from "../adDraft.js";

/**
 * The seller-side listing lifecycle: create a draft, edit it, submit it for
 * publication or optional verification, list what you own, and delete one. Mirrors `auth.js`'s shape —
 * thin functions over `api`, no state of their own — so callers (the create
 * wizard, My Ads) own their own loading/error state the way every other
 * screen in this app already does.
 *
 * `ListingWriteRequest` (see Backend's `ListingController`/`ListingWriteRequest`)
 * takes catalog ids. Category and location pickers store their selected ids
 * directly on the draft; posting never guesses an id from display text.
 */

/** POST /api/v1/listings -> ListingResponse. Starts life as a DRAFT. */
export function createListing(request, idempotencyKey) {
  return api.post("/api/v1/listings", request, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/** PATCH /api/v1/listings/{listingId} -> ListingResponse. */
export function updateListing(listingId, request) {
  return api.patch(`/api/v1/listings/${listingId}`, request);
}

/** Regular ads become ACTIVE; requested verification keeps the ad private. */
export function submitListing(
  listingId,
  idempotencyKey,
  { requestVerification = false } = {},
) {
  return api.post(
    `/api/v1/listings/${listingId}/submit`,
    { requestVerification },
    {
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

/** GET /api/v1/listings/{listingId}?site= -> ListingResponse. */
export function getListing(listingId, site) {
  return api.get(`/api/v1/listings/${listingId}`, { site });
}

/** GET /api/v1/me/listings?site= -> ListingResponse[]. Everything this account owns on this site. */
export function ownedListings(site) {
  return api.get("/api/v1/me/listings", { site });
}

/** Session-owned, unexpired active-ad count on this site; no listing bodies to download. */
export function ownedListingSummary(site) {
  return api.get("/api/v1/me/listings/summary", { site });
}

/** DELETE /api/v1/listings/{listingId} -> 204. */
export function deleteListing(listingId) {
  return api.delete(`/api/v1/listings/${listingId}`);
}

/* ------------------------------------------------------------ publish flow */

/**
 * The wizard's whole "Publish" tap: create the draft on the backend, push
 * every photo through the upload pipeline, then submit in the chosen mode. The one
 * place the create flow crosses from local-only draft state into real API
 * calls — see `adDraft.js`'s module doc.
 *
 * Sequential rather than `Promise.all` for the photo uploads: `sizeBytes`
 * and `checksumSha256` are per-file and the backend caps a listing at six
 * images, so there is nothing to gain from parallelising a handful of
 * uploads and a partial-failure error is far easier to explain ("photo 3 of
 * 5 failed") when they run one at a time.
 */
export async function publishDraft(
  draft,
  { requestVerification = false } = {},
) {
  if (!hasSelectedCategory(draft)) {
    throw new ApiError({
      status: 400,
      code: "CATEGORY_SELECTION_REQUIRED",
      message: SELECT_CATEGORY_MESSAGE,
    });
  }
  if (!hasSelectedLocation(draft)) {
    throw new ApiError({
      status: 400,
      code: "LOCATION_SELECTION_REQUIRED",
      message: SELECT_LOCATION_MESSAGE,
    });
  }
  const request = toListingWriteRequest(draft, {
    site: SITE_SCOPE,
  });

  const listing = await createListing(request, crypto.randomUUID());

  for (let i = 0; i < draft.images.length; i++) {
    const image = draft.images[i];
    const blob = dataUriToBlob(image.url);
    await uploadListingImage(
      listing.id,
      blob,
      image.name || `photo-${i + 1}.jpg`,
    );
  }

  return submitListing(listing.id, crypto.randomUUID(), {
    requestVerification,
  });
}
