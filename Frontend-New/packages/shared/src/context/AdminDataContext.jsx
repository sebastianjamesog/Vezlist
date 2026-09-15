"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { buildSeed, reducer } from "../lib/adminStore";
import { usePersistedObject } from "../lib/persisted";
import { useAdminAuth } from "./AdminAuthContext";

/**
 * The one place the console touches its data.
 *
 * Screens never import `mock.js` and never call `adminStore` directly — they
 * take `state` and `dispatch` from here. That is what keeps the swap to a real
 * API down to this file: replace the reducer with fetches and every screen
 * above it is unchanged.
 *
 * The version lives in the storage key, so editing `mock.js` in dev is not
 * masked by a stale seed sitting in localStorage from yesterday.
 */
const AdminDataContext = createContext(null);

const KEY = "vezlist:admin:v1";

/**
 * Is this the browser telling us the write did not fit?
 *
 * The name and the numeric code both vary by engine — Chromium throws a
 * `DOMException` named `QuotaExceededError`, Firefox's carries the legacy
 * code 1014, and Safari sometimes reuses code 22 for the same condition — so
 * neither alone is a safe test and both are checked.
 */
function isQuotaError(err) {
  if (!(err instanceof DOMException)) return false;
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}

export function AdminDataProvider({ children }) {
  const { admin } = useAdminAuth();
  const [state, rawDispatch] = useReducer(reducer, undefined, buildSeed);
  const [hydrated, setHydrated] = useState(false);
  // Null once a write lands clean; a message the moment one does not. Read by
  // the banner below and by anything downstream that wants to know the last
  // edit may not have made it to disk.
  const [storageError, setStorageError] = useState(null);

  /**
   * `usePersistedObject` writes through whatever store it is handed — the
   * session context hands it a cookie for the same reason. Here it is handed
   * a thin wrap over `localStorage` so a write that does not fit can be
   * caught and surfaced instead of vanishing into the hook's own best-effort
   * `catch {}` — without touching that shared hook, which callers up and down
   * the console rely on staying silent-by-default.
   */
  const store = useMemo(
    () => ({
      getItem: (key) => localStorage.getItem(key),
      removeItem: (key) => localStorage.removeItem(key),
      setItem: (key, value) => {
        try {
          localStorage.setItem(key, value);
          setStorageError(null);
        } catch (err) {
          // A write that does not fit must not read as a write that
          // succeeded — the moderator's last action would otherwise vanish
          // on the next reload with nothing on screen to explain why.
          setStorageError(
            isQuotaError(err)
              ? "This device's storage is full. Your latest change may not be saved — free up space, or reset the console from Settings."
              : "Could not save your changes to this device.",
          );
        }
      },
    }),
    [],
  );
  const [stored, setStored, loaded] = usePersistedObject(KEY, store);

  /**
   * Read once, then never again. `loaded` is false on the server and on the
   * first client render — the window in which the seed has to be what both of
   * them rendered — and flips a tick later with whatever was in the store.
   *
   * The one-shot guard is not tidiness: writing back below changes `stored`,
   * and a rehydrate that watched `stored` would answer its own write forever.
   */
  useEffect(() => {
    if (!loaded || hydrated) return;
    if (stored) rawDispatch({ type: "rehydrate", state: stored });
    setHydrated(true);
  }, [loaded, hydrated, stored]);

  /**
   * ...and write back on every change afterwards. Never before: the effects
   * above and below both run on the render where `loaded` flips, and this one
   * would otherwise persist the seed over the state being rehydrated one line
   * up. `hydrated` is state rather than a ref precisely so this waits for the
   * render *after* that dispatch lands.
   */
  useEffect(() => {
    if (!hydrated) return;
    setStored(state);
    // `setStored` is stable; `state` is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated]);

  /**
   * Who did it, and when, ride along with every action — so the reducer stays
   * a function of its arguments and no screen has to remember to name itself.
   * Reading the clock inside the reducer would make it impure, and React's
   * StrictMode double-invoke would be the thing that found out.
   */
  const dispatch = useCallback(
    (action) =>
      rawDispatch({
        ...action,
        actor: admin?.name ?? "Unknown",
        // The role rides along so the reducer can refuse an action the
        // signed-in admin is not allowed to take, whatever the screen offered.
        role: admin?.role ?? null,
        at: Date.now(),
      }),
    [admin],
  );

  const reset = useCallback(
    () => dispatch({ type: "resetToSeed" }),
    [dispatch],
  );
  const dismissStorageError = useCallback(() => setStorageError(null), []);

  const value = useMemo(
    // `ready` means "showing the stored state", not "storage answered" —
    // screens gate on it to avoid a flash of seed data over real edits.
    () => ({
      state,
      dispatch,
      ready: hydrated,
      reset,
      storageError,
      dismissStorageError,
    }),
    [state, dispatch, hydrated, reset, storageError, dismissStorageError],
  );

  return (
    <AdminDataContext.Provider value={value}>
      {/* A write that silently failed is worse than one that visibly did —
          every screen sits under this provider, so the banner is seen
          wherever the moderator happens to be when it happens. */}
      {storageError && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-[999] flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-center text-[13px] font-semibold text-white"
        >
          <span>{storageError}</span>
          <button
            type="button"
            onClick={dismissStorageError}
            className="shrink-0 rounded-md px-2 py-0.5 underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) {
    throw new Error("useAdminData must be used inside <AdminDataProvider>");
  }
  return ctx;
}
