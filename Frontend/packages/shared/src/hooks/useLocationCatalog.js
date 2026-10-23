"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getLocations } from "../lib/api/catalog.js";
import { setLocationCatalog } from "../lib/locationCatalog.js";
const EMPTY = Object.freeze({
  status: "loading",
  locations: null,
  error: null,
});
let snapshot = EMPTY;
let pending = null;
let revision = 0;
const listeners = new Set();
const publish = (next) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      revision++;
      pending = null;
      snapshot = EMPTY;
      setLocationCatalog(null);
    }
  };
};
function refresh() {
  if (pending) return pending;
  const version = ++revision;
  publish({ ...snapshot, status: "loading", error: null });
  pending = Promise.resolve()
    .then(getLocations)
    .then(
      (locations) => {
        if (version !== revision) return;
        setLocationCatalog(locations);
        publish({ status: "success", locations, error: null });
      },
      (error) => {
        if (version === revision)
          publish({ ...snapshot, status: "error", error });
      },
    )
    .finally(() => {
      if (version === revision) pending = null;
    });
  return pending;
}
export default function useLocationCatalog({ enabled = true } = {}) {
  const listen = useCallback(
    (listener) => (enabled ? subscribe(listener) : () => {}),
    [enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? snapshot : EMPTY),
    [enabled],
  );
  const value = useSyncExternalStore(listen, getSnapshot, () => EMPTY);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const wake = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled]);
  return { ...value, retry: refresh };
}
