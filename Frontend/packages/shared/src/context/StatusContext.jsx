"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePersistedIds } from "../lib/persisted";

/**
 * Status state that has to agree across screens: whose updates you've watched,
 * which is what drives the ring colour.
 */
const StatusContext = createContext(null);

export function StatusProvider({ children }) {
  const [seen, setSeen, ready] = usePersistedIds("vezlist:status-seen");

  const markSeen = useCallback(
    (id) => setSeen((s) => (s.includes(id) ? s : [...s, id])),
    [setSeen],
  );
  const clearSeen = useCallback(() => setSeen([]), [setSeen]);

  const value = useMemo(
    () => ({
      seen,
      // False until the stored ids land, which is one tick after hydration.
      ready,
      markSeen,
      clearSeen,
      isSeen: (id) => seen.includes(id),
    }),
    [seen, ready, markSeen, clearSeen],
  );

  return (
    <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
  );
}

export function useStatus() {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error("useStatus must be used inside <StatusProvider>");
  return ctx;
}
