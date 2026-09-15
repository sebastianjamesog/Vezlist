import { categories } from "../data/mock.js";

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
 */

const byId = new Map(categories.map((c) => [c.id, c]));
const byLabel = new Map(categories.map((c) => [c.label, c]));

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
