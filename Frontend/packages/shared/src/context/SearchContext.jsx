"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { EMPTY, reducer } from "../lib/search";
import { usePersistedObject } from "../lib/persisted";

/**
 * The one place a recent or saved search is kept.
 *
 * `SearchBar` never reads this directly — it is a presentational combobox
 * that every screen using it (the admin tables, `MapView`, `Faqs`, the
 * personals board) can keep mounting with nothing wired to it at all. Only
 * the marketplace's `BrowseScreen` reads through this hook today, the same
 * way `TicketsContext` is read from exactly one route pair despite sitting
 * above the whole shell — a search recorded on the browse screen has to
 * survive the status player unmounting it, so it lives here rather than in
 * that screen's own state.
 *
 * What lands in storage is the whole state, not a delta over a seed — see
 * `lib/search.js` for why there is nothing here to merge the way
 * `tickets.js` merges one over `mock.js`.
 */
const SearchContext = createContext(null);

const KEY = "vezlist:search:v1";

export function SearchProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, EMPTY);
  const [stored, setStored, loaded] = usePersistedObject(KEY);
  const [hydrated, setHydrated] = useState(false);

  /**
   * Read once, then never again — see `ListingsContext` for why the guard is
   * state rather than a ref: the write-back effect below runs on the very
   * render this flips, and a rehydrate that watched `stored` would answer its
   * own write forever.
   */
  useEffect(() => {
    if (!loaded || hydrated) return;
    if (stored) rawDispatch({ type: "rehydrate", state: stored });
    setHydrated(true);
  }, [loaded, hydrated, stored]);

  // ...and write back on every change afterwards, never before — writing on
  // the render `loaded` flips would persist `EMPTY` over the state one line
  // up is about to rehydrate.
  useEffect(() => {
    if (!hydrated) return;
    setStored(state);
    // `setStored` is stable; `state` is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated]);

  /**
   * `Date.now()` is read here, in the handler, never during render and never
   * inside `lib/search.js`. Two searches or two saves cannot land in the same
   * millisecond from one pair of hands, and a save under a name already used
   * replaces it in the reducer regardless.
   */
  const recordSearch = useCallback(
    (term) => rawDispatch({ type: "search", term }),
    [],
  );

  const clearRecent = useCallback(
    () => rawDispatch({ type: "clearRecent" }),
    [],
  );

  /**
   * `params` is the query string `filtersToQueryString` (`lib/filters.js`)
   * produces for the caller's current filters and free-text query — this
   * context never builds or reads that string itself, it only stores it.
   */
  const saveSearch = useCallback((name, params) => {
    const id = `saved-${Date.now().toString(36)}`;
    rawDispatch({ type: "save", id, name, params });
    return id;
  }, []);

  const deleteSaved = useCallback(
    (id) => rawDispatch({ type: "deleteSaved", id }),
    [],
  );

  const value = useMemo(
    () => ({
      recent: state.recent,
      saved: state.saved,
      // "showing what was stored", not "storage answered" — a screen gates
      // on this rather than rendering an empty history and correcting itself
      // a tick later once the store comes back.
      ready: hydrated,
      recordSearch,
      clearRecent,
      saveSearch,
      deleteSaved,
    }),
    [state, hydrated, recordSearch, clearRecent, saveSearch, deleteSaved],
  );

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used inside <SearchProvider>");
  return ctx;
}
