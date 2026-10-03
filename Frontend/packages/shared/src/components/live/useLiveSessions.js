"use client";

import { useEffect, useState } from "react";
import { listLiveCreators } from "../../lib/api/live.js";

/** Optional presence hints: remove stale badges if the directory is unavailable. */
export function useLiveSessions() {
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    let cancelled = false;
    let request = 0;
    async function refresh() {
      const current = ++request;
      try {
        const result = await listLiveCreators(100);
        if (!cancelled && current === request) setSessions(result.items ?? []);
      } catch {
        if (!cancelled && current === request) setSessions([]);
      }
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return sessions;
}
