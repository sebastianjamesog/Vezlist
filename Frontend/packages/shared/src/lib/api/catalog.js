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
 * Public and revalidated, takes no `site` — the location tree is shared by
 * both boards. Each province is `{ id, label, areas: LocationResponse[] }`
 * and each area adds `neighbourhoods: LocationResponse[]`. Rows carry
 * `{ id, label, type, areaId, areaLabel, provinceId, provinceLabel, popular }` — a
 * real area has an id distinct from its label, which `data/locations.js`'s
 * mock table never needed. Callers that have to turn a chosen area's label
 * back into the id `DiscoverySearchRequest.area()` expects (see
 * `discovery.js`) look it up in the areas this returns.
 */
export async function getLocations() {
  // Older releases cached this response for an hour. Reopening the picker must
  // reach the server even if that old response is still fresh in browser cache.
  const catalog = await api.get("/api/v1/locations", undefined, { cache: "no-store" });
  const ids = new Set();
  const validNode = (node) => {
    if (
      !isObject(node) ||
      !isNonEmptyString(node.id) ||
      !isNonEmptyString(node.label) ||
      ids.has(node.id)
    )
      return false;
    ids.add(node.id);
    return true;
  };
  if (
    !isObject(catalog) ||
    !Array.isArray(catalog.provinces) ||
    !catalog.provinces.every(
      (province) =>
        validNode(province) &&
        Array.isArray(province.areas) &&
        province.areas.every(
          (area) =>
            validNode(area) &&
            (area.neighbourhoods == null ||
              (Array.isArray(area.neighbourhoods) &&
                area.neighbourhoods.every(validNode))),
        ),
    )
  ) {
    throw new ApiError({
      status: 502,
      code: "INVALID_LOCATION_CATALOG",
      message: "Could not load locations. Please try again.",
    });
  }
  return catalog;
}

/** Search enabled locations by area or province; an empty query returns suggestions. */
export function searchLocations(query = "", limit = 20) {
  return api.get("/api/v1/locations/search", { q: query.trim(), limit }, { cache: "no-store" });
}

/** Current active ethnicity labels; the server prevents stale HTTP caching. */
export async function getEthnicities() {
  const ethnicities = await api.get("/api/v1/ethnicities");
  const ids = new Set();
  const labels = new Set();
  const valid =
    Array.isArray(ethnicities) &&
    ethnicities.every((ethnicity) => {
      if (
        !isObject(ethnicity) ||
        !isNonEmptyString(ethnicity.id) ||
        !isNonEmptyString(ethnicity.label) ||
        ethnicity.label.length > 80 ||
        ids.has(ethnicity.id) ||
        labels.has(ethnicity.label.toLowerCase())
      )
        return false;
      ids.add(ethnicity.id);
      labels.add(ethnicity.label.toLowerCase());
      return true;
    });
  if (!valid)
    throw new ApiError({
      status: 502,
      code: "INVALID_ETHNICITY_CATALOG",
      message: "Could not load ethnicities. Please try again.",
    });
  return ethnicities;
}
