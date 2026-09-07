"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DEFAULT_FILTERS } from "../lib/filters";

/**
 * What you were browsing on the home feed: the filters and the search box.
 *
 * It lives above the routes because the status player is a full-screen route of
 * its own — opening a story unmounts the whole shell, so page-local state would
 * be gone by the time you closed it and you'd land back on a reset feed instead
 * of the category you left.
 */
const FeedContext = createContext(null);

export function FeedProvider({ children }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");

  const value = useMemo(
    () => ({ filters, setFilters, query, setQuery }),
    [filters, query],
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used inside <FeedProvider>");
  return ctx;
}
