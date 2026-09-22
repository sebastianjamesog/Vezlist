"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getCategories } from "../../lib/api/catalog.js";

const EMPTY = Object.freeze({ status: "loading", categories: [] });
const queries = new Map();

function categoryQuery(site) {
  if (queries.has(site)) return queries.get(site);
  let snapshot = EMPTY;
  let request = null;
  let generation = 0;
  const listeners = new Set();
  const publish = (next) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const query = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          // A reopened form must confirm the current enabled catalog again.
          // Concurrent pickers still share one cached response and request.
          generation += 1;
          request = null;
          snapshot = EMPTY;
        }
      };
    },
    load: () => {
      if (request) return request;
      const current = ++generation;
      publish(EMPTY);
      request = Promise.resolve()
        .then(() => getCategories(site))
        .then(
          (categories) => {
            if (current === generation)
              publish({ status: "success", categories });
          },
          () => {
            if (current === generation)
              publish({ status: "error", categories: [] });
          },
        )
        .finally(() => {
          if (current === generation) request = null;
        });
      return request;
    },
  };
  queries.set(site, query);
  return query;
}

export default function useCategoryCatalog(site) {
  const query = useMemo(() => categoryQuery(site), [site]);
  const snapshot = useSyncExternalStore(
    query.subscribe,
    query.getSnapshot,
    () => EMPTY,
  );
  useEffect(() => {
    if (query.getSnapshot().status === "loading") query.load();
  }, [query]);
  return { ...snapshot, retry: query.load };
}
