"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "./nav.jsx";
import { api } from "./api.js";
import { DEFAULT_FILTERS } from "./filters.js";
import {
  discoveryApiPath,
  discoveryListingToCard,
  discoveryUrlParams,
  filtersFromSearchParams,
} from "./discovery.js";

export function useDiscoveryUrlState({
  catalog,
  defaultSort = "newest",
  allowNearest = false,
  preserveKeys = [],
}) {
  const [params, setParams] = useSearchParams();
  const filters = filtersFromSearchParams(
    params,
    catalog,
    defaultSort,
    allowNearest,
  );
  const query = params.get("q") ?? "";

  const write = useCallback(
    (nextFilters, nextQuery) => {
      const preserve = Object.fromEntries(
        preserveKeys.map((key) => [key, params.get(key)]),
      );
      setParams(
        discoveryUrlParams(nextFilters, nextQuery, catalog, {
          defaultSort,
          preserve,
        }),
      );
    },
    [catalog, defaultSort, params, preserveKeys, setParams],
  );

  const setFilters = useCallback(
    (next) => {
      const resolved = typeof next === "function" ? next(filters) : next;
      write(resolved, query);
    },
    [filters, query, write],
  );
  const setQuery = useCallback(
    (next) => write(filters, next),
    [filters, write],
  );
  const reset = useCallback(
    () => write({ ...DEFAULT_FILTERS, sort: defaultSort }, ""),
    [defaultSort, write],
  );

  return { filters, setFilters, query, setQuery, reset };
}

export function useDiscovery({
  site,
  filters,
  query = "",
  catalog,
  coordinates,
  fixedCategoryIds,
  limit = 24,
}) {
  const path = useMemo(
    () =>
      discoveryApiPath({
        site,
        filters,
        query,
        catalog,
        coordinates,
        fixedCategoryIds,
        limit,
      }),
    [site, filters, query, catalog, coordinates, fixedCategoryIds, limit],
  );
  const [state, setState] = useState({
    items: [],
    nextCursor: null,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: null,
    version: 0,
  });
  const requestVersion = useRef(0);

  useEffect(() => {
    requestVersion.current += 1;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        items: [],
        nextCursor: null,
        hasMore: false,
        loading: true,
        loadingMore: false,
        error: null,
      }));
      api(path, { signal: controller.signal })
        .then((page) => {
          setState((current) => ({
            ...current,
            items: (page.items ?? []).map(discoveryListingToCard),
            nextCursor: page.nextCursor ?? null,
            hasMore: Boolean(page.hasMore),
            loading: false,
            error: null,
          }));
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          setState((current) => ({ ...current, loading: false, error }));
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [path, state.version]);

  const retry = useCallback(
    () => setState((current) => ({ ...current, version: current.version + 1 })),
    [],
  );

  const loadMore = useCallback(() => {
    if (!state.nextCursor || state.loadingMore) return;
    const version = requestVersion.current;
    const nextPath = `${path}&cursor=${encodeURIComponent(state.nextCursor)}`;
    setState((current) => ({ ...current, loadingMore: true, error: null }));
    api(nextPath)
      .then((page) => {
        if (requestVersion.current !== version) return;
        setState((current) => ({
          ...current,
          items: [
            ...current.items,
            ...(page.items ?? []).map(discoveryListingToCard),
          ],
          nextCursor: page.nextCursor ?? null,
          hasMore: Boolean(page.hasMore),
          loadingMore: false,
        }));
      })
      .catch((error) => {
        if (requestVersion.current !== version) return;
        setState((current) => ({ ...current, loadingMore: false, error }));
      });
  }, [path, state.loadingMore, state.nextCursor]);

  return { ...state, retry, loadMore };
}

export function useDiscoveryMap({
  site,
  filters,
  query = "",
  catalog,
  coordinates,
  fixedCategoryIds,
  limit = 200,
}) {
  const path = useMemo(
    () =>
      coordinates
        ? discoveryApiPath({
            site,
            filters,
            query,
            catalog,
            coordinates,
            fixedCategoryIds,
            limit,
            map: true,
          })
        : null,
    [site, filters, query, catalog, coordinates, fixedCategoryIds, limit],
  );
  const [pins, setPins] = useState([]);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api(path, { signal: controller.signal })
        .then((result) => setPins(Array.isArray(result) ? result : []))
        .catch((error) => {
          if (error.name !== "AbortError") setPins([]);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [path]);

  return pins;
}
