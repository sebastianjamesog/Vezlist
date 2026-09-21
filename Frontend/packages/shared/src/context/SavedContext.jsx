"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext.jsx";
import {
  listSavedListings,
  saveListing,
  unsaveListing,
} from "../lib/api/saved.js";
import { SITE_SCOPE } from "../lib/api/client.js";

/**
 * Saved/bookmarked listing ids, shared by the ad page heart and the Saved
 * Items screen — backed by the real GET/POST/DELETE
 * /api/v1/listings/{id}/saved and GET /api/v1/me/saved-listings
 * (cc.vezlist.saved.web.SavedListingController) rather than a bare
 * localStorage array of ids.
 *
 * The backend requires a session for every one of those calls — there is no
 * guest-saves concept on the wire, unlike the old mock version of this
 * context, which let a signed-out visitor save freely to this device. So
 * `toggle`/`remove` are no-ops while signed out, and `ids`/`rows`/`count`
 * are simply empty rather than reading a local list nothing on the server
 * would recognise.
 *
 * Two pieces of state, not one, because they answer two different
 * questions at two different costs. `ids` (a Set) is what `isSaved` and the
 * heart on an ad page need, and it is kept optimistic — flipped the instant
 * `toggle` is called, before the request even resolves — because a heart
 * that waits on the network reads as broken. `rows` is the full
 * `SavedListingResponse` list (title, price, image, …) the Saved Items
 * screen renders, and there is no way to fabricate one of those
 * client-side for a listing just saved, so it is refreshed from the server
 * after every mutation rather than kept optimistic itself.
 */
const SavedContext = createContext(null);

async function fetchAllSaved(site) {
  const rows = [];
  let cursor;
  // Capped rather than unbounded: a saved list a few thousand rows deep
  // should not turn "open the app" into fifty sequential requests. 20 pages
  // at the server's max of 50 is 1000 rows, comfortably past anything a
  // real user would accumulate; a list bigger than that would need real
  // pagination on the Saved Items screen, which is a bigger feature than
  // this context is trying to be.
  for (let page = 0; page < 20; page += 1) {
    const res = await listSavedListings({ site, cursor, limit: 50 });
    rows.push(...(res?.items ?? []));
    if (!res?.hasMore || !res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return rows;
}

export function SavedProvider({ children }) {
  const { signedIn, ready: authReady } = useAuth();
  const [rows, setRows] = useState([]);
  const [idSet, setIdSet] = useState(() => new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    if (!signedIn) {
      generation.current += 1;
      setRows([]);
      setIdSet(new Set());
      setError(null);
      setReady(true);
      return Promise.resolve();
    }
    const gen = ++generation.current;
    setError(null);
    return fetchAllSaved(SITE_SCOPE)
      .then((items) => {
        if (gen !== generation.current) return;
        setRows(items);
        setIdSet(new Set(items.map((r) => r.id)));
        setReady(true);
      })
      .catch((err) => {
        if (gen !== generation.current) return;
        setError(err);
        setReady(true);
      });
  }, [signedIn]);

  useEffect(() => {
    if (!authReady) return;
    setReady(false);
    refresh();
  }, [authReady, signedIn, refresh]);

  const isSaved = useCallback((id) => idSet.has(id), [idSet]);

  /** Flip one listing's saved state. A no-op while signed out. */
  const toggle = useCallback(
    async (id) => {
      if (!signedIn) return;
      const was = idSet.has(id);
      setIdSet((prev) => {
        const next = new Set(prev);
        if (was) next.delete(id);
        else next.add(id);
        return next;
      });
      try {
        if (was) await unsaveListing(id, SITE_SCOPE);
        else await saveListing(id, SITE_SCOPE);
        // `rows` has no local stand-in for a row it has never fetched, so
        // this is what keeps the Saved Items list in sync — non-blocking,
        // the heart itself already has its answer from `idSet` above.
        refresh();
      } catch (err) {
        // Resync with the server's actual state rather than guessing at a
        // rollback — the request may have partially applied.
        refresh();
        throw err;
      }
    },
    [signedIn, idSet, refresh],
  );

  /** Explicit unsave — the Saved Items "Remove" row and the account-deletion sweep. */
  const remove = useCallback(
    async (id) => {
      if (!signedIn) return;
      setIdSet((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRows((rs) => rs.filter((r) => r.id !== id));
      try {
        await unsaveListing(id, SITE_SCOPE);
      } catch (err) {
        refresh();
        throw err;
      }
    },
    [signedIn, refresh],
  );

  const ids = useMemo(() => Array.from(idSet), [idSet]);

  const value = useMemo(
    () => ({
      ids,
      rows,
      ready,
      error,
      retry: refresh,
      toggle,
      remove,
      isSaved,
      count: ids.length,
    }),
    [ids, rows, ready, error, refresh, toggle, remove, isSaved],
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
