"use client";
import { useEffect, useState } from "react";
import { searchListings } from "../lib/api/discovery.js";

function empty(key) {
  return {
    key,
    items: [],
    nextCursor: null,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: null,
    scroll: { top: 0 },
  };
}

/** Retain the current result pages while an ad is open. A new search resets
 * the list; responses from the previous search cannot join the new one. */
export default function useBrowseResults(params, cache) {
  const key = JSON.stringify(params);
  const [state, setState] = useState(() =>
    cache?.current?.key === key && Date.now() - cache.current.updatedAt < 60_000
      ? { ...cache.current, loadingMore: false }
      : empty(key),
  );
  let current = state;
  if (state.key !== key) {
    current = empty(key);
    setState(current);
  }
  useEffect(() => {
    if (cache) cache.current = current;
  }, [cache, current]);
  useEffect(() => {
    if (!current.loading) return;
    let cancelled = false;
    searchListings(JSON.parse(key))
      .then((res) => {
        if (!cancelled)
          setState((s) =>
            s.key === key
              ? {
                  ...s,
                  items: res?.items ?? [],
                  nextCursor: res?.nextCursor ?? null,
                  hasMore: !!res?.hasMore,
                  loading: false,
                  error: null,
                  updatedAt: Date.now(),
                }
              : s,
          );
      })
      .catch((error) => {
        if (!cancelled)
          setState((s) =>
            s.key === key ? { ...s, loading: false, error } : s,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [key, current.loading]);

  function loadMore() {
    if (!current.hasMore || current.loadingMore || !current.nextCursor) return;
    setState((s) => ({ ...s, loadingMore: true }));
    searchListings({ ...JSON.parse(key), cursor: current.nextCursor })
      .then((res) =>
        setState((s) =>
          s.key === key
            ? {
                ...s,
                items: [...s.items, ...(res?.items ?? [])],
                nextCursor: res?.nextCursor ?? null,
                hasMore: !!res?.hasMore,
                loadingMore: false,
                error: null,
              }
            : s,
        ),
      )
      .catch((error) =>
        setState((s) =>
          s.key === key ? { ...s, loadingMore: false, error } : s,
        ),
      );
  }
  function retry() {
    setState((s) => ({ ...s, loading: true, error: null }));
  }
  return { ...current, loadMore, retry };
}
