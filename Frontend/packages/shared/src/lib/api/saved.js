import { api } from "./client.js";

/**
 * GET /api/v1/listings/{listingId}/saved?site= -> SavedStateResponse
 * ({ listingId, saved, totalCount }).
 * (cc.vezlist.saved.web.SavedListingController#state)
 *
 * Requires a session — the backend reads `principal.id()` unconditionally,
 * so a signed-out call fails with a 401 `ApiError` rather than answering
 * `saved: false`. Callers gate on `useAuth().signedIn` before reaching for
 * this.
 */
export function getSavedState(listingId, site) {
  return api.get(`/api/v1/listings/${listingId}/saved`, { site });
}

/**
 * POST /api/v1/listings/{listingId}/saved?site= -> SavedStateResponse.
 * (cc.vezlist.saved.web.SavedListingController#save)
 */
export function saveListing(listingId, site) {
  return api.post(`/api/v1/listings/${listingId}/saved?site=${encodeURIComponent(site)}`);
}

/**
 * DELETE /api/v1/listings/{listingId}/saved?site= -> SavedStateResponse.
 * (cc.vezlist.saved.web.SavedListingController#unsave)
 */
export function unsaveListing(listingId, site) {
  return api.delete(`/api/v1/listings/${listingId}/saved`, { site });
}

/**
 * GET /api/v1/me/saved-listings?site=&cursor=&limit= -> SavedListingPageResponse
 * ({ items: SavedListingResponse[], nextCursor, hasMore, totalCount }).
 * (cc.vezlist.saved.web.SavedListingController#savedListings)
 *
 * `cursor` is opaque, from a previous page's `nextCursor`; `limit` is 1-50.
 * Each `SavedListingResponse` row already carries everything a saved-items
 * tile needs to render (`title, businessName, price, categoryId,
 * categoryLabel, provinceId, provinceLabel, locationId, locationLabel,
 * verified, imageUrl, photoCount, publishedAt, savedAt`) — no follow-up
 * listing-detail call is needed to draw the list.
 */
export function listSavedListings({ site, cursor, limit } = {}) {
  return api.get("/api/v1/me/saved-listings", { site, cursor, limit });
}
