"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FILTERS } from "../lib/filters";
import { getCategories as fetchCategories, getLocations } from "../lib/api/catalog.js";
import { SITE_SCOPE } from "../lib/api/client.js";
import { setCategories } from "../lib/taxonomy.js";

/**
 * What you were browsing on the home feed: the filters and the search box —
 * plus, now, the real taxonomy and location tree those filters are drawn
 * from.
 *
 * It lives above the routes because the status player is a full-screen route of
 * its own — opening a story unmounts the whole shell, so page-local state would
 * be gone by the time you closed it and you'd land back on a reset feed instead
 * of the category you left.
 *
 * Categories and locations are fetched once here, from GET /api/v1/categories
 * and GET /api/v1/locations (cc.vezlist.catalog.web.CatalogController — both
 * public and cacheable), rather than by every screen that used to import them
 * from `data/mock.js`. Categories are also pushed into `lib/taxonomy.js`'s
 * registry as soon as they answer, so every existing consumer of that
 * module — the filter sheet, the search suggester, the category grid — sees
 * the real list without itself knowing there was a network call. Until that
 * answers (or if it fails), those consumers keep reading the mock list
 * `taxonomy.js` falls back to, which is a real taxonomy — just not the one
 * the server currently has seeded — rather than an empty one.
 */
const FeedContext = createContext(null);

export function FeedProvider({ children }) {
  const browseCache = useRef(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");

  const [categories, setLocalCategories] = useState([]);
  const [locations, setLocations] = useState(null);
  const [taxonomyReady, setTaxonomyReady] = useState(false);
  const [taxonomyError, setTaxonomyError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reloadTaxonomy = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setTaxonomyError(null);
    Promise.all([fetchCategories(SITE_SCOPE), getLocations()])
      .then(([cats, locs]) => {
        if (cancelled) return;
        setLocalCategories(cats ?? []);
        setCategories(cats ?? []);
        setLocations(locs ?? null);
        setTaxonomyReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setTaxonomyError(err);
        setCategories([]);
        setTaxonomyReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const value = useMemo(
    () => ({
      browseCache,
      filters,
      setFilters,
      query,
      setQuery,
      categories,
      locations,
      taxonomyReady,
      taxonomyError,
      reloadTaxonomy,
    }),
    [
      filters,
      query,
      categories,
      locations,
      taxonomyReady,
      taxonomyError,
      reloadTaxonomy,
    ],
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used inside <FeedProvider>");
  return ctx;
}
