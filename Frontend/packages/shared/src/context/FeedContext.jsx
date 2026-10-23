"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_FILTERS } from "../lib/filters";
import { getCategories as fetchCategories } from "../lib/api/catalog.js";
import { SITE_SCOPE } from "../lib/api/client.js";
import useLocationCatalog from "../hooks/useLocationCatalog.js";
import { setCategories } from "../lib/taxonomy.js";

/** Shared browsing state; category and location requests fail independently.
 * Locations are refreshed through one shared catalog for both public boards.
 */
const FeedContext = createContext(null);

export function FeedProvider({ children }) {
  const browseCache = useRef(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");

  const [categories, setLocalCategories] = useState([]);
  const {
    locations,
    status: locationStatus,
    error: locationError,
    retry: reloadLocations,
  } = useLocationCatalog();
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [categoryError, setCategoryError] = useState(null);
  const taxonomyReady = categoriesReady && locationStatus !== "loading";
  const taxonomyError = categoryError ?? locationError;
  const [reloadToken, setReloadToken] = useState(0);

  const reloadTaxonomy = useCallback(() => {
    setReloadToken((t) => t + 1);
    reloadLocations();
  }, [reloadLocations]);

  useEffect(() => {
    let cancelled = false;
    setCategoryError(null);
    fetchCategories(SITE_SCOPE)
      .then((cats) => {
        if (cancelled) return;
        setLocalCategories(cats ?? []);
        setCategories(cats ?? []);
        setCategoriesReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setCategoryError(err);
        setCategories([]);
        setCategoriesReady(true);
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
