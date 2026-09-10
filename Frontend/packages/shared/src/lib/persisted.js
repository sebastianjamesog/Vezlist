"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * State backed by localStorage, safe to server-render.
 *
 * The server has no localStorage, so the first client render has to match the
 * server's fallback or React discards the whole tree as a hydration mismatch.
 * The stored value arrives one tick later, and nothing is written back until it
 * has — otherwise mounting would clobber the store with the fallback it starts
 * from. `loaded` says whether that has happened, for callers that must not read
 * the value too early.
 */
export function usePersisted(key, fallback, decode) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let stored = fallback;
    try {
      stored = decode(localStorage.getItem(key));
    } catch {
      // Private mode, blocked storage and junk in the slot are all "no value".
    }
    setValue(stored);
    setLoaded(true);
    // `fallback` and `decode` are constants at every call site below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Persisting is a nicety, not a requirement.
    }
  }, [key, value, loaded]);

  return [value, setValue, loaded];
}

const NO_IDS = [];

const decodeIds = (raw) => {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed.filter((id) => typeof id === "string")
    : NO_IDS;
};

/** A reusable list of browser-persisted ids, such as watched statuses. */
export function usePersistedIds(key) {
  return usePersisted(key, NO_IDS, decodeIds);
}

const decodeFlag = (raw) => raw === "1" || raw === "true";

/** A single on/off switch. */
export function usePersistedFlag(key) {
  const [on, setOn, loaded] = usePersisted(key, false, decodeFlag);
  // Stored as JSON like everything else; the legacy "1" form still reads.
  return [on, setOn, loaded];
}

const decodeObject = (raw) => {
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : null;
};

/** An object, or null when there isn't one. */
export function usePersistedObject(key) {
  const [value, setValue, loaded] = usePersisted(key, null, decodeObject);
  const clear = useCallback(() => setValue(null), [setValue]);
  return [value, setValue, loaded, clear];
}
