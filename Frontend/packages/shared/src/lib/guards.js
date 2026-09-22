/**
 * Shape checks for data that crossed a storage boundary.
 *
 * Every context in this app reads localStorage or a cookie — both fully
 * under the visitor's control, whether by hand-editing devtools or by a
 * stale key left over from a shape this build no longer writes. `listings.js`
 * already carries its own defence (`normaliseAdsState`, tested by "a
 * hand-edited cookie cannot crash a screen") and that is the
 * pattern here: no schema library (`plan.md` — "Not adding: ... a form
 * library"), just the small primitives every store's own normaliser is built
 * from, so the check reads next to the shape it is checking rather than in a
 * separate DSL.
 *
 * The rule every normaliser built on these follows: a value that is not
 * shaped like what it claims to be is dropped and the caller falls back to
 * its seed or default — never thrown, never half-trusted into React state.
 * A field this file does not know to check is left exactly as it arrived,
 * because "unexpected" and "wrong" are not the same fault — see each store's
 * own normalise function for where that line is drawn.
 */

/** A plain object — not `null`, and not an array wearing `typeof "object"`. */
export const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isString = (value) => typeof value === "string";

/** A string with something in it once the whitespace a form would trim is gone. */
export const isNonEmptyString = (value) =>
  isString(value) && value.trim().length > 0;

export const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

/**
 * An array, filtered to the items that pass `itemGuard` — anything that is
 * not an array at all comes back empty rather than `null` or `undefined`, so
 * a caller can always `.map`/`.filter` what this returns.
 */
export function arrayOf(value, itemGuard) {
  if (!Array.isArray(value)) return [];
  return itemGuard ? value.filter(itemGuard) : value;
}

/**
 * A row shaped like the ones every reducer's `find`/`patch` keys on: an
 * object with the id every one of those helpers assumes is there. This is
 * deliberately the *minimum* a stored row must carry, not everything it
 * should — a row that fails other, more specific checks a store adds on top
 * is still dropped by those, and one that only has fields this does not know
 * about keeps them, because an unrecognised field is not the same fault as a
 * missing id.
 */
export const hasId = (row) => isObject(row) && isNonEmptyString(row.id);
