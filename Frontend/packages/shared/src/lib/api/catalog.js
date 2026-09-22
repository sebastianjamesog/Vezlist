import { api, ApiError } from "./client.js";
import { isNonEmptyString, isObject } from "../guards.js";

/**
 * GET /api/v1/categories?site= -> CategoryResponse[].
 * (cc.vezlist.catalog.web.CatalogController#categories)
 *
 * Public, revalidated on each request and does not require a session. `site` defaults to
 * MARKETPLACE server-side, but every caller here passes `SITE_SCOPE`
 * explicitly rather than relying on that default.
 *
 * Each row is `{ id, label, icon, primary }` — there is no sub-category on
 * the wire. `lib/taxonomy.js`'s `subs` concept was mock-only; feeding it a
 * real category (no `subs` field at all) makes every "does this have a
 * sub-category" check answer "no", which is the correct degrade rather than
 * a special case.
 */
export async function getCategories(site) {
  const categories = await api.get("/api/v1/categories", { site });
  const ids = new Set();
  const valid =
    Array.isArray(categories) &&
    categories.every((category) => {
      if (
        !isObject(category) ||
        !isNonEmptyString(category.id) ||
        !isNonEmptyString(category.label) ||
        ids.has(category.id)
      )
        return false;
      ids.add(category.id);
      return true;
    });
  if (!valid) {
    throw new ApiError({
      status: 502,
      code: "INVALID_CATEGORY_CATALOG",
      message: "Could not load categories. Please try again.",
    });
  }
  return categories;
}

/**
 * GET /api/v1/locations -> LocationsResponse
 * ({ provinces: ProvinceResponse[], popularAreas: LocationResponse[] }).
 * (cc.vezlist.catalog.web.CatalogController#locations)
 *
 * Public, cacheable (1h), takes no `site` — the location tree is shared by
 * both boards. Each province is `{ id, label, areas: LocationResponse[] }`
 * and each area is `{ id, label, provinceId, provinceLabel, popular }` — a
 * real area has an id distinct from its label, which `data/locations.js`'s
 * mock table never needed. Callers that have to turn a chosen area's label
 * back into the id `DiscoverySearchRequest.area()` expects (see
 * `discovery.js`) look it up in the areas this returns.
 */
export function getLocations() {
  return api.get("/api/v1/locations");
}

/** Search enabled locations by area or province; an empty query returns suggestions. */
export function searchLocations(query = "", limit = 20) {
  return api.get("/api/v1/locations/search", { q: query.trim(), limit });
}
