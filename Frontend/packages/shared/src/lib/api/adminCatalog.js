import { api } from "./client.js";

/**
 * Admin console: taxonomy administration (categories + locations), over
 * `cc.vezlist.catalog.web.AdminCatalogController`. Reads are MODERATOR/ADMIN;
 * writes are ADMIN-only — the backend enforces both, this module just calls
 * through.
 *
 * A category's `id` is server-derived from its label (a slug) — callers
 * never send one on create, and `AdminCategoryResponse.id` is what comes
 * back. Deleting a category or an area that active listings still reference
 * answers 409 with `code: "CATALOG_ENTRY_IN_USE"`; callers should show that
 * message rather than treat it like an unexpected failure.
 */

/** GET /api/v1/admin/categories?site= -> AdminCategoryResponse[]. */
export function listCategories(site) {
  return api.get("/api/v1/admin/categories", { site });
}

/** POST /api/v1/admin/categories -> AdminCategoryResponse. `{label, icon, site, primary, displayOrder}`. */
export function createCategory(request) {
  return api.post("/api/v1/admin/categories", request);
}

/** PATCH /api/v1/admin/categories/{id} -> AdminCategoryResponse. `{label, icon, primary, displayOrder, enabled}`. */
export function updateCategory(id, request) {
  return api.patch(`/api/v1/admin/categories/${id}`, request);
}

/** DELETE /api/v1/admin/categories/{id} -> 204. 409 CATALOG_ENTRY_IN_USE if referenced. */
export function deleteCategory(id) {
  return api.delete(`/api/v1/admin/categories/${id}`);
}

/** GET /api/v1/admin/locations?provinceId= -> AdminLocationResponse[] (provinces and/or their areas). */
export function listLocations(provinceId) {
  return api.get("/api/v1/admin/locations", { provinceId });
}

/** POST /api/v1/admin/locations/provinces -> AdminLocationResponse. `{label, displayOrder}`. */
export function createProvince(request) {
  return api.post("/api/v1/admin/locations/provinces", request);
}

/** POST /api/v1/admin/locations/areas -> AdminLocationResponse. `{label, provinceId, displayOrder, popular}`. */
export function createArea(request) {
  return api.post("/api/v1/admin/locations/areas", request);
}

/** PATCH /api/v1/admin/locations/{id} -> AdminLocationResponse. `{label, displayOrder, popular, enabled}`. Works for provinces and areas alike. */
export function updateLocation(id, request) {
  return api.patch(`/api/v1/admin/locations/${id}`, request);
}

/**
 * DELETE /api/v1/admin/locations/{id} -> 204. Works for provinces and areas
 * alike; 409 CATALOG_ENTRY_IN_USE if a province still has areas under it or
 * anything (province or area) is still referenced by an active listing.
 */
export function deleteArea(id) {
  return api.delete(`/api/v1/admin/locations/${id}`);
}

/** Move within its board; the server updates all affected orders in one transaction. */
export function moveCategory(id, direction) {
  return api.post(`/api/v1/admin/categories/${encodeURIComponent(id)}/move`, { direction });
}
