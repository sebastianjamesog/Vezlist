import { categories as mockCategories } from "../data/mock.js";

/**
 * The category tree, and the four questions every screen asks of it.
 *
 * The tree is two levels and stops there. A third would need breadcrumbs in the
 * feed heading, a third step in the create form and a recursive picker, and no
 * classifieds board has ever needed one — "Vehicles › Cars & Trucks" is where
 * people stop describing and start searching.
 *
 * The rule the whole feature turns on: **a sub-category is optional at every
 * point it is asked for.** An ad may sit directly in Vehicles. A filter on
 * Vehicles matches those ads as well as the ones under its sub-categories, and
 * only a filter that names a sub-category narrows past them. Every helper here
 * is written so the absent case is the easy one.
 *
 * The category *list* itself is now a swappable registry rather than a bare
 * import of the mock. GET /api/v1/categories returns the real thing —
 * `{ id, label, icon, primary }`, no `subs` at all — and `FeedContext` calls
 * `setCategories` once that answers so every consumer of this module (the
 * filter sheet, the search suggester, the category grid) sees it without
 * having to fetch anything themselves. Until that happens (the first paint,
 * the server render, a build with no network) this falls back to the mock
 * list so every existing caller and test keeps working unmodified — and
 * because a real category carries no `subs`, `subsFor`/`subsForId` simply
 * answer `[]` for it, which is the same "no sub-category on offer" case this
 * module already treats as the easy one rather than an error.
 */

let categories = mockCategories;
let byId = new Map(categories.map((c) => [c.id, c]));
let byLabel = new Map(categories.map((c) => [c.label, c]));

/** Swap in the real category list once the API has answered. */
export function setCategories(list) {
  categories = Array.isArray(list) && list.length ? list : mockCategories;
  byId = new Map(categories.map((c) => [c.id, c]));
  byLabel = new Map(categories.map((c) => [c.label, c]));
}

/** The category list currently in effect — the mock until `setCategories` runs. */
export function getCategories() {
  return categories;
}

export const categoryById = (id) => byId.get(id) ?? null;
export const categoryByLabel = (label) => byLabel.get(label) ?? null;

/** The sub-categories of a category named by label. Never null — an empty list. */
export function subsFor(categoryLabel) {
  return byLabel.get(categoryLabel)?.subs ?? [];
}

/** Same, by id, for the routes that carry `?cat=vehicles`. */
export function subsForId(categoryId) {
  return byId.get(categoryId)?.subs ?? [];
}

/**
 * Is this a real sub-category of this category?
 *
 * Used wherever a sub-category arrives from outside the app — a query string, a
 * restored draft, a stored filter. `null` is valid: it is what "they did not
 * want one" looks like, and rejecting it would make the optional case an error.
 */
export function isSubOf(categoryLabel, sub) {
  if (sub == null || sub === "") return true;
  return subsFor(categoryLabel).includes(sub);
}

/**
 * How a category and its optional sub-category are written wherever both are
 * shown at once — a feed heading, an ad's detail line, a review step.
 *
 * One place, because the separator is a decision: "Vehicles › Cars & Trucks"
 * with a chevron rather than a slash or a comma, so it reads as a path down
 * into something rather than as two unrelated tags.
 */
export function categoryPath(categoryLabel, sub) {
  if (!categoryLabel) return "";
  return sub ? `${categoryLabel} › ${sub}` : categoryLabel;
}
