"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getEthnicities } from "../lib/api/catalog.js";

const EMPTY = Object.freeze({ status: "loading", ethnicities: [] });
const DISABLED = Object.freeze({ status: "idle", ethnicities: [] });
let snapshot = EMPTY;
let pending = null;
let generation = 0;
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
      generation++;
      pending = null;
      snapshot = EMPTY;
    }
  };
};

function refresh() {
  if (pending) return pending;
  const revision = ++generation;
  publish(EMPTY);
  pending = Promise.resolve()
    .then(getEthnicities)
    .then(
      (ethnicities) => {
        if (revision === generation)
          publish({ status: "success", ethnicities });
      },
      () => {
        if (revision === generation)
          publish({ status: "error", ethnicities: [] });
      },
    )
    .finally(() => {
      if (revision === generation) pending = null;
    });
  return pending;
}

/** Shared current catalog; forms refresh on focus and pickers on each opening. */
export default function useEthnicities({ enabled = true } = {}) {
  const listen = useCallback(
    (listener) => (enabled ? subscribe(listener) : () => {}),
    [enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? snapshot : DISABLED),
    [enabled],
  );
  const value = useSyncExternalStore(listen, getSnapshot, () =>
    enabled ? EMPTY : DISABLED,
  );
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const onFocus = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled]);
  return { ...value, retry: refresh };
}
