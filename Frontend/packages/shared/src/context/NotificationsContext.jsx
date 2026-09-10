"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";
import { SITE } from "../lib/sites";
import { createNotificationsQuery } from "../lib/notifications";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user, ready } = useAuth();
  // A new authenticated user object also replaces the cache on same-user login.
  const query = useMemo(
    () => createNotificationsQuery(api, SITE, Boolean(ready && user)),
    [ready, user],
  );
  useEffect(() => {
    query.activate();
    query.count();
    const refresh = () => {
      if (document.visibilityState === "visible") query.refresh();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      query.dispose();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [query]);
  return (
    <NotificationsContext.Provider value={query}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const query = useContext(NotificationsContext);
  if (!query)
    throw new Error("useNotifications requires NotificationsProvider");
  const snapshot = useSyncExternalStore(
    query.subscribe,
    query.getSnapshot,
    query.getSnapshot,
  );
  return { ...snapshot, query };
}
