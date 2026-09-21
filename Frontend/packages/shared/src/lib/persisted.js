"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { arrayOf, isObject, isString } from "./guards.js";

/**
 * localStorage, wrapped so a caller can hand in something else with the same
 * three methods. The session does exactly that: it needs a cookie, because
 * localStorage is per-origin and the two sites share one account.
 */
const localStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

/**
 * The value under `key`, falling back once to the name that key used to have.
 *
 * Versioning a key is what stops a shape this hook no longer understands being
 * read forever. Renaming without carrying the old slot forward is the other
 * half of that trade, and it is the expensive half: it silently throws away
 * whatever the reader had already saved. Same class of data loss the decoders
 * below exist to prevent, arriving by a different door.
 *
 * Moves rather than copies, so the fallback fires exactly once and a value
 * edited under the new name is never overwritten by a stale one under the old.
 * Pure in its store, which is what makes it testable without a DOM.
 */
export function readWithMigration(store, key, legacyKey = null) {
  const current = store.getItem(key);
  if (current !== null || !legacyKey) return current;

  const legacy = store.getItem(legacyKey);
  if (legacy === null) return null;

  store.setItem(key, legacy);
  store.removeItem(legacyKey);
  return legacy;
}

/**
 * State backed by a client-side store, safe to server-render.
 *
 * The server has neither localStorage nor cookies it can read here, so the
 * first client render has to match the server's fallback or React discards the
 * whole tree as a hydration mismatch. The stored value arrives one tick later,
 * and nothing is written back until it has — otherwise mounting would clobber
 * the store with the fallback it starts from. `loaded` says whether that has
 * happened, for callers that must not read the value too early.
 */
export function usePersisted(
  key,
  fallback,
  decode,
  store = localStore,
  legacyKey = null,
) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);
  // The raw string this hook last read or wrote. Re-reading the store is only
  // worth a render when it says something other than what we put there.
  const raw = useRef(null);

  useEffect(() => {
    let stored = fallback;
    try {
      raw.current = readWithMigration(store, key, legacyKey);
      stored = decode(raw.current);
    } catch {
      // Private mode, blocked storage and junk in the slot are all "no value".
    }
    setValue(stored);
    setLoaded(true);
    // `fallback`, `decode`, `store` and `legacyKey` are constants at every call
    // site below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (value === null) {
        store.removeItem(key);
        raw.current = null;
      } else {
        raw.current = JSON.stringify(value);
        store.setItem(key, raw.current);
      }
    } catch {
      // Persisting is a nicety, not a requirement.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value, loaded]);

  /**
   * The store is the truth, and this tab is not the only one writing to it.
   * Another tab — or the *other site*, which is a separate origin sharing one
   * session cookie — can sign out while this tab sits in the background, and a
   * tab that never re-reads goes on rendering a session that is gone. So it
   * re-reads whenever it is looked at again.
   */
  useEffect(() => {
    if (!loaded) return;

    const sync = () => {
      if (document.visibilityState !== "visible") return;
      let next;
      try {
        next = store.getItem(key);
      } catch {
        return;
      }
      if (next === raw.current) return;
      raw.current = next;
      try {
        setValue(decode(next));
      } catch {
        setValue(fallback);
      }
    };

    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded]);

  return [value, setValue, loaded];
}

const NO_IDS = [];

/**
 * A list of ids, or nothing. `JSON.parse` can hand back anything the store
 * holds — a hand-edited value, an object from a shape this hook never wrote,
 * a bare number — so the array check comes first, and every entry that
 * survives the filter is a string, not merely present. `usePersisted`'s own
 * `try/catch` still covers a `raw` that is not JSON at all; this covers JSON
 * that parsed fine and is simply not the shape asked for. Exported for direct
 * testing, the way `wallet.js` exports `normaliseWallet` rather than only
 * exercising it through a hook.
 */
export const decodeIds = (raw) => arrayOf(JSON.parse(raw), isString);

/** A list of ids — saved ads, watched statuses. */
export function usePersistedIds(key, legacyKey = null) {
  return usePersisted(key, NO_IDS, decodeIds, localStore, legacyKey);
}

export const decodeFlag = (raw) => raw === "1" || raw === "true";

/** A single on/off switch. */
export function usePersistedFlag(key) {
  const [on, setOn, loaded] = usePersisted(key, false, decodeFlag);
  // Stored as JSON like everything else; the legacy "1" form still reads.
  return [on, setOn, loaded];
}

/**
 * An object, or `null`. `typeof [] === "object"` too, so `isObject` is what
 * keeps an array — which has none of the keys any caller of
 * `usePersistedObject` reads by name — from passing as one.
 */
export const decodeObject = (raw) => {
  const parsed = JSON.parse(raw);
  return isObject(parsed) ? parsed : null;
};

/** An object, or null when there isn't one. */
export function usePersistedObject(key, store) {
  const [value, setValue, loaded] = usePersisted(
    key,
    null,
    decodeObject,
    store,
  );
  const clear = useCallback(() => setValue(null), [setValue]);
  return [value, setValue, loaded, clear];
}
