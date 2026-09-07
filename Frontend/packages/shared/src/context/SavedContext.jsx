"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePersistedIds } from "../lib/persisted";

/** Saved/bookmarked ad ids, shared by the ad page heart and the Saved Items screen. */
const SavedContext = createContext(null);

export function SavedProvider({ children }) {
  const [ids, setIds] = usePersistedIds("vezlist:saved");

  const toggle = useCallback(
    (id) =>
      setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    [setIds],
  );
  const remove = useCallback(
    (id) => setIds((s) => s.filter((x) => x !== id)),
    [setIds],
  );

  const value = useMemo(
    () => ({
      ids,
      toggle,
      remove,
      isSaved: (id) => ids.includes(id),
      count: ids.length,
    }),
    [ids, toggle, remove],
  );

  return (
    <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
  );
}

export function useSaved() {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used inside <SavedProvider>");
  return ctx;
}
