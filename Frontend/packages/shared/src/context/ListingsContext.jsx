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
import { buildSeed, reducer } from "../lib/listings";
import { usePersistedObject } from "../lib/persisted";
import { urlToStrippedDataUri } from "../lib/media";

/**
 * The one place the poster's own ads are touched.
 *
 * The shell publishes through it and My Ads reads and edits through it, so the
 * ad that was submitted and the ad that shows up under "In review" are the same
 * row and cannot drift apart. Screens never call `listings.js` directly, which
 * is what keeps the swap to a real API down to this file.
 *
 * The version lives in the storage key, so editing `mock.js` in dev is not
 * masked by a stale seed sitting in localStorage from yesterday. localStorage
 * is per-origin, so the marketplace and personals each keep their own copy —
 * the same limitation the admin console documents, and the same fix: a server.
 */
const ListingsContext = createContext(null);

const KEY = "vezlist:ads:v1";

/* ------------------------------------------------------------- photos (#12) */

/**
 * INTERIM, half of #12 (media upload) — the client half. There is still no
 * upload endpoint or object storage, and no moderation scan (#13, needs a
 * real pipeline): what leaves this browser is a data URI, not a URL a server
 * handed back, and #12's server half replaces this wholesale once one exists.
 *
 * What *is* done, and done here as much as in `StepPhotos`: `CreateAdSheet`
 * downscales every photo to a stripped-metadata, watermarked JPEG data URI
 * the moment it is picked (see `lib/media.js`'s `downscaleToDataUri` for the
 * EXIF/GPS guarantee, the burnt-in provenance mark, and how each was
 * verified), so by the time a draft reaches `publish`/`save` its
 * `images[].url` entries are already data URIs, not `blob:` pointers into
 * this tab's memory. `urlToStrippedDataUri` below is kept as a defensive
 * second pass rather than removed — a `blob:` URL reaching this layer today
 * would already be a bug, but a stray one (a future call site, a draft
 * restored from an older build's shape) is safer stripped than stored as-is,
 * and every other kind of URL it sees (already a `data:` URI, or `https:`
 * from a seeded row) is returned unchanged with no work done at all.
 *
 * That last clause is also why this pass cannot stamp a second watermark
 * over the first: the only URLs it opens a canvas for are `blob:` ones, and
 * a `blob:` URL is by definition one that has not been through the pipeline
 * yet — anything that has is a `data:` URI and returns untouched. Photos
 * that are already marked and photos about to be marked are disjoint sets
 * here, so inheriting the mark from `downscaleToDataUri` costs nothing.
 *
 * Downscaling matters for a second reason beyond EXIF: localStorage is a
 * ~5MB budget for the whole store, and six photos straight off a phone
 * camera is twenty. Blowing the quota fails the write for *every* ad, not
 * just the new one — `usePersisted` swallows the error, so the symptom would
 * be an ad that silently vanishes on reload.
 */
const inlinePhoto = urlToStrippedDataUri;

/**
 * Every photo on a draft, inlined — a no-op pass-through in the common case
 * now that `CreateAdSheet` has already done this work, and the defensive
 * pass described above for anything that hasn't.
 */
const inlinePhotos = (draft) =>
  Promise.all((draft.images ?? []).map((i) => inlinePhoto(i.url))).then(
    (urls) => ({
      ...draft,
      images: draft.images.map((image, i) => ({ ...image, url: urls[i] })),
    }),
  );

/* ---------------------------------------------------------------- provider */

export function ListingsProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, buildSeed);
  const [stored, setStored, loaded] = usePersistedObject(KEY);
  const [hydrated, setHydrated] = useState(false);

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
   * ...and write back on every change afterwards. Never before: both effects
   * run on the render where `loaded` flips, and this one would otherwise
   * persist the seed over the state being rehydrated one line up.
   */
  useEffect(() => {
    if (!hydrated) return;
    setStored(state);
    // `setStored` is stable; `state` is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated]);

  /** The clock rides on the action so the reducer stays pure. */
  const dispatch = useCallback(
    (action) => rawDispatch({ ...action, at: Date.now() }),
    [],
  );

  /**
   * The wizard's draft becomes a pending ad. Async because the photos have to
   * be read out of the tab's memory before they are stored — see above — and
   * the caller waits for it so the "we'll review it shortly" toast fires after
   * the write rather than instead of it.
   */
  const publish = useCallback(
    async (draft) => {
      dispatch({ type: "publish", draft: await inlinePhotos(draft) });
    },
    [dispatch],
  );

  const save = useCallback(
    async (id, draft) => {
      dispatch({ type: "edit", id, draft: await inlinePhotos(draft) });
    },
    [dispatch],
  );

  const renew = useCallback(
    (id) => dispatch({ type: "renew", id }),
    [dispatch],
  );
  const remove = useCallback(
    (id) => dispatch({ type: "remove", id }),
    [dispatch],
  );

  const value = useMemo(
    // `ready` means "showing the stored ads", not "storage answered" — the
    // seed renders until then, which is the mock and not an empty screen.
    () => ({
      ads: state.ads,
      ready: hydrated,
      publish,
      save,
      renew,
      remove,
    }),
    [state.ads, hydrated, publish, save, renew, remove],
  );

  return (
    <ListingsContext.Provider value={value}>
      {children}
    </ListingsContext.Provider>
  );
}

export function useListings() {
  const ctx = useContext(ListingsContext);
  if (!ctx) {
    throw new Error("useListings must be used inside <ListingsProvider>");
  }
  return ctx;
}
