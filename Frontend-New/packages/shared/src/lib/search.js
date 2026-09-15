import { applyFilters, DEFAULT_FILTERS } from "./filters.js";
import { isNonEmptyString, isObject, isString } from "./guards.js";

/**
 * The assistive layer over search: what a reader typed before (`recent`) and
 * the filter sets they named and kept (`saved`). One reducer, no React —
 * `SearchContext` is the only caller, which keeps a swap to a real backend
 * down to that one file, the same split `tickets.js` and `reports.js` use.
 *
 * There is no seed to merge here the way `tickets.js` merges a delta over
 * `mock.js`'s rows: nobody has searched or saved anything before a reader
 * opens this build for the first time, so what lands in storage *is* the
 * whole state rather than a delta on top of one — `reports.js`'s shape, for
 * the same reason.
 *
 * A saved search does not carry its own copy of what a filter set means. It
 * stores the exact string `filtersToQueryString` in `lib/filters.js` produces
 * — the same shape a shareable URL would carry — and `paramsToFilters` is
 * what turns it back into `{ filters, query }` when it is rerun. This file
 * never inspects that string; to it, `params` is opaque.
 */

/** Nothing searched, nothing saved. */
export const EMPTY = { recent: [], saved: [] };

/** A history, not a log — the oldest term falls off once this many are kept. */
export const MAX_RECENT = 8;

/** How long a saved search's name may run before the field stops taking it. */
export const MAX_NAME = 60;

const text = (value) => (value ?? "").toString().trim();

/** A recent-search row worth keeping: a non-empty term and nothing else. */
const isValidRecent = (row) => isObject(row) && isNonEmptyString(row.term);

/**
 * A saved search worth keeping: a name and the query string that reruns it.
 * `params` is checked as a string rather than as non-empty — `filtersToParams`
 * can honestly produce `""` for a search that narrows nothing but the
 * free-text query, and rejecting that here would be a second, disagreeing
 * definition of what a valid filter set is from the one `lib/filters.js`
 * already owns.
 */
const isValidSaved = (row) =>
  isObject(row) &&
  isNonEmptyString(row.id) &&
  isNonEmptyString(row.name) &&
  isString(row.params);

/**
 * The guard `rehydrate` runs a stored state through before folding it over
 * `EMPTY` — the pattern `normaliseTicketsState` and `normaliseReportsState`
 * both set. A `recent` or `saved` that is not an array is dropped rather than
 * merged in; `recent` is also capped here, so a `MAX_RECENT` lowered in a
 * later build is honoured for a browser that already has more stored than
 * that. A top-level key neither name comes back the same way — nothing reads
 * it, so keeping it is not tolerance, it is corruption handed to the next
 * reader.
 */
export function normaliseSearchState(value) {
  if (!isObject(value)) return {};
  const next = {};
  if (Array.isArray(value.recent)) {
    next.recent = value.recent.filter(isValidRecent).slice(0, MAX_RECENT);
  }
  if (Array.isArray(value.saved)) {
    next.saved = value.saved.filter(isValidSaved);
  }
  return next;
}

/**
 * The verbs a reader has. Every id and every clock read arrives on the
 * action — `SearchContext` reads `Date.now()` in its handlers, never here —
 * so this stays a pure function of its arguments and React's StrictMode
 * double-invoke cannot make two calls disagree.
 */
export function reducer(state, action) {
  switch (action.type) {
    /** A term actually searched — Enter pressed, or a suggestion chosen. */
    case "search": {
      const term = text(action.term);
      if (!term) return state;
      const lower = term.toLowerCase();
      // Re-searching a term already somewhere in the list moves it back to
      // the front rather than leaving a second copy behind it.
      const rest = state.recent.filter((r) => r.term.toLowerCase() !== lower);
      return { ...state, recent: [{ term }, ...rest].slice(0, MAX_RECENT) };
    }

    case "clearRecent":
      return { ...state, recent: [] };

    case "save": {
      const name = text(action.name).slice(0, MAX_NAME);
      if (!name) return state;
      const row = { id: action.id, name, params: action.params ?? "" };
      // Saving under a name already in use replaces it rather than piling up
      // a second row with the same name and a different filter set behind
      // it — "My commute" is one saved search, not a growing list of them.
      const rest = state.saved.filter(
        (s) => s.name.toLowerCase() !== name.toLowerCase(),
      );
      return { ...state, saved: [row, ...rest] };
    }

    case "deleteSaved":
      return {
        ...state,
        saved: state.saved.filter((s) => s.id !== action.id),
      };

    /**
     * Storage handing back what it kept, folded over `EMPTY` rather than used
     * as-is — the same reason `tickets.js` and `reports.js` do it: a key this
     * shape has grown since the stored copy was written must not arrive
     * `undefined` at a screen that calls `.map`/`.length` on it.
     */
    case "rehydrate":
      return { ...EMPTY, ...normaliseSearchState(action.state) };

    default:
      return state;
  }
}

/* ------------------------------------------------------------- suggest */

/**
 * What to offer while a reader is typing: matching categories, their
 * sub-categories, and matching listings — in that order, categories first
 * because naming a whole category is usually what typing "vehicles" means
 * before it is a search for the word "vehicles" inside a title.
 *
 * Listings are found with `applyFilters` from `lib/filters.js` — the exact
 * function the feed itself narrows with — rather than a second `.includes`
 * check written here. Two matchers over the same word is how a suggestion
 * shows up for a listing a search does not actually return, or the reverse;
 * reusing the one `applyFilters` already owns is what keeps that impossible
 * rather than merely unlikely.
 *
 * Pure and synchronous — no debounce, no request, nothing here reaches past
 * the `categories` and `listings` the caller hands in.
 */
export function suggest(term, opts = {}) {
  const { categories = [], listings = [], limit = 8 } = opts;
  const q = text(term).toLowerCase();
  if (!q) return [];

  const categoryHits = [];
  for (const c of categories) {
    if (categoryHits.length >= limit) break;
    if (c.label.toLowerCase().includes(q)) {
      categoryHits.push({
        id: `cat:${c.id}`,
        type: "category",
        label: c.label,
        categoryId: c.id,
      });
    }
    for (const sub of c.subs ?? []) {
      if (categoryHits.length >= limit) break;
      if (sub.toLowerCase().includes(q)) {
        categoryHits.push({
          id: `sub:${c.id}:${sub}`,
          type: "subcategory",
          label: sub,
          categoryId: c.id,
          category: c.label,
          subcategory: sub,
        });
      }
    }
  }

  const remaining = Math.max(limit - categoryHits.length, 0);
  const listingHits = remaining
    ? applyFilters(listings, DEFAULT_FILTERS, q)
        .slice(0, remaining)
        .map((l) => ({
          id: `listing:${l.id}`,
          type: "listing",
          label: l.title,
          listingId: l.id,
          adId: l.adId ?? l.id,
        }))
    : [];

  return [...categoryHits, ...listingHits];
}
