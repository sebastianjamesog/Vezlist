import { provinceById, provinces } from "../data/locations.js";
import { isSubOf } from "./taxonomy.js";

const WINDOWS = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };

export const DEFAULT_FILTERS = {
  sort: "newest",
  categories: [],
  /**
   * One optional sub-category, or null.
   *
   * Singular where `categories` is plural, and that asymmetry is the feature:
   * narrowing to Vehicles *and* Property is a reasonable thing to want, but
   * narrowing to Cars & Trucks *and* Motorcycles is what the Vehicles filter
   * already does. It only has meaning under exactly one category, so it is
   * dropped whenever the category selection stops being exactly that one.
   */
  subcategory: null,
  // Personals only; the marketplace never sets either, and an empty list
  // filters nothing, so both boards run the same function.
  personalsCategories: [],
  ethnicities: [],
  province: "all",
  cities: [],
  verifiedOnly: false,
  /**
   * Personals only. "Available now" is a claim the person behind the post
   * makes about themselves — they are free to be contacted this minute — and
   * that is a sentence the marketplace has no use for: a dining table is not
   * available now, it is in stock, which is a different fact with a different
   * shelf life. So only `personalsListings` rows carry `available`, only the
   * personals sheet offers the control, and `applyFilters` below is written so
   * that a board with no such field is left alone rather than emptied.
   */
  availableOnly: false,
  postedWithin: "any",
};

/**
 * Drop a sub-category that no longer means anything.
 *
 * A sub-category only has a referent under exactly one category: pick Vehicles
 * then Motorcycles, then add Property, and "Motorcycles" is now a filter
 * against two categories only one of which has ever heard of it. Rather than
 * define what that means, it is dropped.
 *
 * Every writer of `categories` runs its patch through this, so the invalid
 * state is not reachable rather than merely unrendered.
 */
export function reconcileSubcategory(f) {
  if (!f.subcategory) return f;
  const only = f.categories.length === 1 ? f.categories[0] : null;
  if (only && isSubOf(only, f.subcategory)) return f;
  return { ...f, subcategory: null };
}

/** How many filter groups the user has actually narrowed (sort is not a filter). */
export function activeFilterCount(f) {
  return (
    (f.categories.length ? 1 : 0) +
    // Counted on its own: it is a second decision, and a reader who sees "1
    // filter" after picking a category and then a sub-category would think the
    // second one had not taken.
    (f.subcategory ? 1 : 0) +
    (f.personalsCategories.length ? 1 : 0) +
    (f.ethnicities.length ? 1 : 0) +
    // Province and areas are one choice to the user, so they count once.
    (f.province !== "all" || f.cities.length ? 1 : 0) +
    (f.verifiedOnly ? 1 : 0) +
    (f.availableOnly ? 1 : 0) +
    (f.postedWithin !== "any" ? 1 : 0)
  );
}

/** Chips shown above the feed; `clear` returns the filter patch that removes it. */
export function activeFilterChips(f) {
  const chips = [];
  for (const c of f.categories) {
    chips.push({
      key: `cat:${c}`,
      label: c,
      clear: { categories: f.categories.filter((x) => x !== c) },
    });
  }
  if (f.subcategory) {
    chips.push({
      key: `sub:${f.subcategory}`,
      label: f.subcategory,
      clear: { subcategory: null },
    });
  }
  for (const c of f.personalsCategories) {
    chips.push({
      key: `pcat:${c}`,
      label: c,
      clear: {
        personalsCategories: f.personalsCategories.filter((x) => x !== c),
      },
    });
  }
  for (const e of f.ethnicities) {
    chips.push({
      key: `eth:${e}`,
      label: e,
      clear: { ethnicities: f.ethnicities.filter((x) => x !== e) },
    });
  }
  if (f.province !== "all") {
    chips.push({
      key: `prov:${f.province}`,
      label: provinceById(f.province).label,
      // Dropping the province drops the areas inside it too.
      clear: { province: "all", cities: [] },
    });
  }
  for (const c of f.cities) {
    chips.push({
      key: `city:${c}`,
      label: c,
      clear: { cities: f.cities.filter((x) => x !== c) },
    });
  }
  if (f.verifiedOnly)
    chips.push({
      key: "verified",
      label: "Verified only",
      clear: { verifiedOnly: false },
    });
  // Chipped like every other non-default filter, and for one reason above the
  // rest: it is the only filter whose subject changes underneath it. Somebody
  // who is free now is not free in an hour, so the reader has to be able to
  // see that this is what is narrowing the board, and drop it in one tap.
  if (f.availableOnly)
    chips.push({
      key: "available",
      label: "Available now",
      clear: { availableOnly: false },
    });
  if (f.postedWithin !== "any") {
    const labels = {
      "24h": "Last 24 hours",
      "7d": "Last 7 days",
      "30d": "Last 30 days",
    };
    chips.push({
      key: "posted",
      label: labels[f.postedWithin],
      clear: { postedWithin: "any" },
    });
  }
  return chips;
}

/**
 * What the filter button should call itself right now.
 *
 * Naming the one thing that is on beats a generic "Filter" next to a count the
 * user has to open the sheet to read. Past one chip there is no room to name
 * them, so it falls back to how many.
 */
export function filterButtonLabel(f) {
  const chips = activeFilterChips(f);
  if (!chips.length) return "Filter";
  if (chips.length === 1) return chips[0].label;
  // A province and its cities are several chips but one filter, so the count
  // can still be 1 here — which is why it is spelled rather than assumed.
  const count = activeFilterCount(f);
  return `${count} filter${count === 1 ? "" : "s"}`;
}

/** Filter then sort. */
export function applyFilters(listings, filters, query = "") {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const q = query.trim().toLowerCase();
  const window = WINDOWS[f.postedWithin] ?? null;

  const out = listings.filter((l) => {
    if (
      q &&
      !`${l.title} ${l.business} ${l.category}`.toLowerCase().includes(q)
    )
      return false;
    if (f.categories.length && !f.categories.includes(l.category)) return false;
    // Only ever narrows *within* a category. An ad filed straight under
    // Vehicles has no sub-category, so naming one has to exclude it — that is
    // what asking for Cars & Trucks means.
    if (f.subcategory && l.subcategory !== f.subcategory) return false;
    if (
      f.personalsCategories.length &&
      !f.personalsCategories.includes(l.personalsCategory)
    )
      return false;
    if (f.ethnicities.length && !f.ethnicities.includes(l.ethnicity))
      return false;
    if (f.province !== "all" && l.province !== provinceById(f.province).label)
      return false;
    if (f.cities.length && !f.cities.includes(l.location)) return false;
    if (f.verifiedOnly && !l.verified) return false;
    /*
      Excludes the rows that say no, not the rows that never said anything.

      The literal reading of "available only" is `l.available === true`, and on
      the personals board the two are the same function: every row there
      carries the boolean, so `=== false` and `!== true` select identical sets.
      They come apart on the marketplace, whose rows have no `available` field
      at all — and there the literal reading returns nothing. That is the wrong
      answer to give: the flag can only reach a marketplace list by a route the
      UI does not offer (a hand-edited query string, a saved search carried
      across, a shared link), and the reader who arrives that way is looking at
      an empty board with no way to tell that a filter they never set is the
      reason. An unfiltered board with a clearable "Available now" chip over it
      says what happened and hands them the undo.

      So a listing that makes no availability claim is not contradicted by one.
      An ad is dropped only when its poster has actually said they are not
      free, which is the only case where "available now" has anything to
      exclude.
    */
    if (f.availableOnly && l.available === false) return false;
    if (window !== null && l.postedMsAgo > window) return false;
    return true;
  });

  const sorters = {
    newest: (a, b) => a.postedMsAgo - b.postedMsAgo,
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    nearest: (a, b) => a.distanceKm - b.distanceKm,
  };
  return out.sort(sorters[f.sort] ?? sorters.newest);
}

/* --------------------------------------------------------- URL round-trip */

const SORTS = new Set(["newest", "price-asc", "price-desc", "nearest"]);
const POSTED_WITHINS = new Set(Object.keys(WINDOWS));

/**
 * Every filter field that is not at its default, plus the free-text query, as
 * the plain object `useSearchParams`'s setter in `lib/nav.jsx` already turns
 * into a query string (`new URLSearchParams(next).toString()`). This is the
 * one place a filter set is turned into strings; `paramsToFilters` below is
 * its exact inverse, and a saved search (`lib/search.js`) stores nothing but
 * the string this produces — there is no second, parallel shape for "what a
 * filter set means" to fall out of sync with this one.
 *
 * Array fields join on a comma, the convention the browse screen's own
 * `?cat=`/`?sub=` already use for a single value. Only fields that differ from
 * `DEFAULT_FILTERS` are written, so a filter set with nothing narrowed
 * round-trips to an empty object rather than a page-wide dump of defaults.
 */
export function filtersToParams(filters, query = "") {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const params = {};
  const q = (query ?? "").trim();
  if (q) params.q = q;
  if (f.sort !== DEFAULT_FILTERS.sort) params.sort = f.sort;
  if (f.categories.length) params.categories = f.categories.join(",");
  if (f.subcategory) params.subcategory = f.subcategory;
  if (f.personalsCategories.length) {
    params.personalsCategories = f.personalsCategories.join(",");
  }
  if (f.ethnicities.length) params.ethnicities = f.ethnicities.join(",");
  if (f.province !== DEFAULT_FILTERS.province) params.province = f.province;
  if (f.cities.length) params.cities = f.cities.join(",");
  if (f.verifiedOnly) params.verified = "1";
  if (f.availableOnly) params.available = "1";
  if (f.postedWithin !== DEFAULT_FILTERS.postedWithin) {
    params.postedWithin = f.postedWithin;
  }
  return params;
}

/** `filtersToParams`, stringified — what a saved search actually stores. */
export function filtersToQueryString(filters, query = "") {
  return new URLSearchParams(filtersToParams(filters, query)).toString();
}

const csv = (value) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * `filtersToParams`'s inverse: a query string, a `URLSearchParams`, or a
 * plain object — anything the `URLSearchParams` constructor accepts — back to
 * `{ filters, query }`.
 *
 * Read the way every other rehydrate in this app reads a storage boundary. A
 * saved search is a string a browser's storage held, not a value this build
 * chose, so `sort`, `province` and `postedWithin` are checked against the
 * values `applyFilters` actually knows and fall back to `DEFAULT_FILTERS`
 * field by field rather than producing a filter set nothing chose. Everything
 * else — `categories`, `cities`, and the rest — is left as free text the way
 * it always has been: `applyFilters` already treats an unrecognised category
 * as one that matches nothing, not as a crash, so there is no second guard to
 * write here. `reconcileSubcategory` runs on the way out for the same reason
 * it runs on every other writer of `categories`: a stored sub-category only
 * means something under the one category it was saved against.
 */
export function paramsToFilters(paramsLike) {
  const params =
    paramsLike instanceof URLSearchParams
      ? paramsLike
      : new URLSearchParams(paramsLike ?? "");

  const sort = params.get("sort");
  const province = params.get("province");
  const postedWithin = params.get("postedWithin");

  const filters = reconcileSubcategory({
    ...DEFAULT_FILTERS,
    sort: sort && SORTS.has(sort) ? sort : DEFAULT_FILTERS.sort,
    categories: csv(params.get("categories")),
    subcategory: params.get("subcategory") || null,
    personalsCategories: csv(params.get("personalsCategories")),
    ethnicities: csv(params.get("ethnicities")),
    province:
      province && provinces.some((p) => p.id === province)
        ? province
        : DEFAULT_FILTERS.province,
    cities: csv(params.get("cities")),
    verifiedOnly: params.get("verified") === "1",
    availableOnly: params.get("available") === "1",
    postedWithin:
      postedWithin && POSTED_WITHINS.has(postedWithin)
        ? postedWithin
        : DEFAULT_FILTERS.postedWithin,
  });

  return { filters, query: params.get("q") ?? "" };
}
