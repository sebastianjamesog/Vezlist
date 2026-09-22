import { api, SITE_SCOPE } from "./client.js";
import { dataUriToBlob, uploadListingImage } from "./media.js";
import { toListingWriteRequest } from "../adDraft.js";

/**
 * The seller-side listing lifecycle: create a draft, edit it, submit it for
 * review, list what you own, and delete one. Mirrors `auth.js`'s shape —
 * thin functions over `api`, no state of their own — so callers (the create
 * wizard, My Ads) own their own loading/error state the way every other
 * screen in this app already does.
 *
 * `ListingWriteRequest` (see Backend's `ListingController`/`ListingWriteRequest`)
 * takes catalog ids, not the free-text labels the create wizard's draft
 * holds — `resolveCategoryId`/`resolveLocationId` below bridge that gap by
 * reading the same public catalog endpoints the browse/discovery screens use,
 * without this module owning a catalog cache of its own.
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

/** POST /api/v1/listings/{listingId}/submit -> ListingResponse. Draft/rejected -> pending review. */
export function submitListing(listingId, idempotencyKey) {
  return api.post(`/api/v1/listings/${listingId}/submit`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/** GET /api/v1/listings/{listingId}?site= -> ListingResponse. */
export function getListing(listingId, site) {
  return api.get(`/api/v1/listings/${listingId}`, { site });
}

/** GET /api/v1/me/listings?site= -> ListingResponse[]. Everything this account owns on this site. */
export function ownedListings(site) {
  return api.get("/api/v1/me/listings", { site });
}

/** DELETE /api/v1/listings/{listingId} -> 204. */
export function deleteListing(listingId) {
  return api.delete(`/api/v1/listings/${listingId}`);
}

/* ------------------------------------------------------- catalog lookups */

let categoriesCache = null; // Map<site, Promise<CategoryResponse[]>>
let locationsCache = null; // Promise<LocationsResponse>

function loadCategories(site) {
  categoriesCache ??= new Map();
  if (!categoriesCache.has(site)) {
    categoriesCache.set(site, api.get("/api/v1/categories", { site }));
  }
  return categoriesCache.get(site);
}

function loadLocations() {
  locationsCache ??= api.get("/api/v1/locations");
  return locationsCache;
}

const norm = (value) => (value ?? "").toString().trim().toLowerCase();

/**
 * The wizard's category pill is a label ("Property", "Dating"...); the
 * write request wants the backend's category id ("property"). Matched by
 * label first, since that is what the pill actually chose; falls back to the
 * site's first (primary) category so a create can still go through rather
 * than fail outright on a label the catalog has since renamed.
 */
export async function resolveCategoryId(label, site) {
  const categories = await loadCategories(site);
  const match = categories.find((c) => norm(c.label) === norm(label));
  return (match ?? categories[0])?.id ?? null;
}

/**
 * The wizard's location is free text ("Metro Vancouver"); the write request
 * wants a location id plus the province it belongs to. Matched by area
 * label, then by province label, falling back to the first popular area so a
 * location that doesn't match anything still resolves to somewhere real.
 */
export async function resolveLocationId(label) {
  const { provinces, popularAreas } = await loadLocations();
  const allAreas = provinces.flatMap((p) => p.areas);
  const area =
    allAreas.find((a) => norm(a.label) === norm(label)) ??
    allAreas.find((a) => norm(a.provinceLabel) === norm(label)) ??
    popularAreas[0] ??
    allAreas[0];
  return area
    ? { locationId: area.id, provinceId: area.provinceId }
    : { locationId: null, provinceId: null };
}

/* ------------------------------------------------------------ publish flow */

/**
 * The wizard's whole "Publish" tap: create the draft on the backend, push
 * every photo through the upload pipeline, then submit for review. The one
 * place the create flow crosses from local-only draft state into real API
 * calls — see `adDraft.js`'s module doc.
 *
 * Sequential rather than `Promise.all` for the photo uploads: `sizeBytes`
 * and `checksumSha256` are per-file and the backend caps a listing at six
 * images, so there is nothing to gain from parallelising a handful of
 * uploads and a partial-failure error is far easier to explain ("photo 3 of
 * 5 failed") when they run one at a time.
 */
export async function publishDraft(draft) {
  const [categoryId, location] = await Promise.all([
    resolveCategoryId(draft.category, SITE_SCOPE),
    resolveLocationId(draft.location),
  ]);

  const request = toListingWriteRequest(draft, {
    site: SITE_SCOPE,
    categoryId,
    provinceId: location.provinceId,
    locationId: location.locationId,
  });

  const listing = await createListing(request, crypto.randomUUID());

  for (let i = 0; i < draft.images.length; i++) {
    const image = draft.images[i];
    const blob = dataUriToBlob(image.url);
    await uploadListingImage(listing.id, blob, image.name || `photo-${i + 1}.jpg`);
  }

  return submitListing(listing.id, crypto.randomUUID());
}
