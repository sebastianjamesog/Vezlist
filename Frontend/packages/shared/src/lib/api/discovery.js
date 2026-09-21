import { api } from "./client.js";

/**
 * GET /api/v1/listings -> DiscoveryPageResponse
 * ({ items: DiscoveryListingResponse[], nextCursor, hasMore }).
 * (cc.vezlist.discovery.web.DiscoveryController#search,
 * cc.vezlist.discovery.web.DiscoverySearchRequest)
 *
 * Cursor-paginated search over active listings. `params.site` is required
 * (pass `SITE_SCOPE`); everything else mirrors `DiscoverySearchRequest`'s
 * fields and is optional:
 *
 *   q            free text
 *   category     string[] of category ids (see `catalog.js#getCategories`)
 *   province     one province id ("on", "bc", …) or "all"/omitted for none
 *   area         string[] of area ids (NOT labels — `data/locations.js`'s
 *                mock table only carries labels, so a caller narrowing by
 *                city has to resolve the label to the id a real
 *                `getLocations()` call returned)
 *   minPrice / maxPrice
 *   verifiedOnly boolean
 *   postedWithin one of "24h" | "7d" | "30d" (omit for "any")
 *   sort         one of the `DiscoverySort` enum's values
 *   latitude / longitude / radiusKm  (nearby search)
 *   cursor       opaque, from a previous page's `nextCursor`
 *   limit        1-50, defaults server-side
 *
 * `category`/`area` are arrays: `client.js`'s `withQuery` only knows how to
 * write one value per key, so this flattens them to a comma-joined string —
 * `DiscoverySearchRequest`'s Spring binding accepts a single
 * comma-separated parameter the same way it accepts one repeated key.
 *
 * There is no field here for the marketplace mock's personals-only facets
 * (sub-category, ethnicity, personals category, "available now") — the
 * backend's `DiscoverySearchRequest` has nothing for any of them, so a
 * caller that still offers those controls in its filter UI has to leave
 * them unsent rather than invent a query param the server will ignore.
 */
export function searchListings(params = {}) {
  const { category, area, ...rest } = params;
  return api.get("/api/v1/listings", {
    ...rest,
    category: joinList(category),
    area: joinList(area),
  });
}

/**
 * GET /api/v1/listings/map -> DiscoveryMapPinResponse[].
 * (cc.vezlist.discovery.web.DiscoveryController#mapPins,
 * cc.vezlist.discovery.web.DiscoveryMapRequest)
 *
 * The lightweight pin projection for a map view. `site`, `latitude`,
 * `longitude` and `radiusKm` are required; `q`, `category`, `province`,
 * `area`, `minPrice`, `maxPrice`, `verifiedOnly`, `postedWithin` and `limit`
 * (1-500) are optional, with the same array-flattening as `searchListings`.
 */
export function mapPins(params = {}) {
  const { category, area, ...rest } = params;
  return api.get("/api/v1/listings/map", {
    ...rest,
    category: joinList(category),
    area: joinList(area),
  });
}

/**
 * GET /api/v1/listings/{listingId}?site= -> ListingResponse.
 * (cc.vezlist.listings.web.ListingController#detail)
 *
 * This one call is the odd one out in this file — its home is
 * `ListingController`, not `DiscoveryController` — but it lives here rather
 * than in `lib/api/listings.js` because that module belongs to the
 * create/edit-listing flow (draft/submit/update/delete, owned elsewhere),
 * while this is the *public read* half of listing detail this module's
 * `AdDetail` surface needs: full body (`title, businessName, description,
 * price, category*, province*, location*, contactEmail, contactPhone,
 * latitude, longitude, attributes, viewCount, saveCount, media[], …`).
 * Public when the listing is published; a session is optional (unsigned-in
 * readers still see a published ad) but required to see one's own
 * unpublished draft — either way this issues the same unauthenticated-safe
 * GET, since `client.js` always sends the session cookie when there is one.
 */
export function getListingDetail(listingId, site) {
  return api.get(`/api/v1/listings/${listingId}`, { site });
}

function joinList(value) {
  if (value === undefined || value === null) return undefined;
  const list = Array.isArray(value) ? value : [value];
  const cleaned = list.filter((v) => v !== undefined && v !== null && v !== "");
  return cleaned.length ? cleaned.join(",") : undefined;
}
