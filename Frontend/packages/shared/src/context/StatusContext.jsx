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
import { usePersistedIds, usePersistedObject } from "../lib/persisted";
import {
  EMPTY_REACTIONS,
  STORY_TTL_MS,
  isUpdateActive,
  reactionFor,
  reactionsReducer,
} from "../lib/status";
import { stories as seedStories } from "../data/mock";

/**
 * Status state that has to agree across screens: whose updates you've watched
 * (which is what drives the ring colour), and this device's own reactions to
 * updates it has looked at.
 */
const StatusContext = createContext(null);

// Versioned like every other storage key this app writes (`vezlist:ads:v1`,
// `vezlist:admin:v1`...) — this one had not been until now, which meant a
// shape this hook stops writing would sit in `localStorage` forever, read
// forever after. `usePersistedIds`'s own guard already drops anything that
// is not an array of strings, so nothing here actually breaks today; this is
// the seam for the day it does.
const KEY = "vezlist:status-seen:v1";
// See `SavedContext` — the pre-version name, migrated forward on first read.
const LEGACY_KEY = "vezlist:status-seen";

// A second, independent key for reactions — a hand-edited or stale
// `status-seen` value has never been able to corrupt what a viewer reacted
// with, and mixing the two into one object would change that.
const REACTIONS_KEY = "vezlist:status-reactions:v1";

// A third key, for the updates this device has posted to its own story.
// Separate from the two above for the same reason those are separate from
// each other: what you posted, what you watched and what you reacted with
// fail independently, and one corrupt value should not take the other two
// with it. Stored as the delta only — the seed story in `mock.js` is never
// copied in, so editing that seed in dev is never masked by yesterday's
// storage. Same rule `tickets.js` follows.
const MY_STORY_KEY = "vezlist:my-story:v1";

export function StatusProvider({ children }) {
  const [seen, setSeen, ready] = usePersistedIds(KEY, LEGACY_KEY);

  const markSeen = useCallback(
    (id) => setSeen((s) => (s.includes(id) ? s : [...s, id])),
    [setSeen],
  );
  const clearSeen = useCallback(() => setSeen([]), [setSeen]);

  /**
   * Reactions, kept the same shape `TicketsProvider` keeps tickets in: a
   * pure reducer over the delta this device has created, folded over a
   * stored copy exactly once. See `lib/status.js` for why a reaction never
   * leaves this store — there is no server for it to travel to.
   */
  const [reactions, rawDispatch] = useReducer(
    reactionsReducer,
    EMPTY_REACTIONS,
  );
  const [storedReactions, setStoredReactions, reactionsLoaded] =
    usePersistedObject(REACTIONS_KEY);
  const [reactionsHydrated, setReactionsHydrated] = useState(false);

  // Read once, then never again — see `TicketsContext` for why the guard is
  // state rather than a ref.
  useEffect(() => {
    if (!reactionsLoaded || reactionsHydrated) return;
    if (storedReactions) {
      rawDispatch({ type: "rehydrate", state: storedReactions });
    }
    setReactionsHydrated(true);
  }, [reactionsLoaded, reactionsHydrated, storedReactions]);

  // ...and write back on every change afterwards, never before.
  useEffect(() => {
    if (!reactionsHydrated) return;
    setStoredReactions(reactions);
    // `setStoredReactions` is stable; `reactions` is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactions, reactionsHydrated]);

  const react = useCallback((storyId, updateId, emoji) => {
    rawDispatch({ type: "react", storyId, updateId, emoji });
  }, []);

  /**
   * The updates this device has posted to its own story.
   *
   * Kept here rather than in the composer because three screens read it —
   * the player rolls through it, the profile row counts it and the composer
   * appends to it — and a piece of state three screens share is not local
   * state. It never mutates the imported `stories` array: that is the bug
   * class issue #37 exists to remove, and a story pushed into a module-level
   * array is gone the moment the page reloads.
   */
  const [storedMine, setStoredMine, mineLoaded] =
    usePersistedObject(MY_STORY_KEY);

  /**
   * The clock the 24-hour expiry is measured against.
   *
   * State set from an effect, never read during a render. A story you posted
   * carries a real `postedAt`, so unlike the fixtures — whose age is a fixed
   * number baked into `mock.js` — deciding whether it is still current means
   * asking what time it is, and asking that while rendering is how this repo
   * has produced hydration mismatches before. `null` until the effect runs,
   * which costs nothing: `storedMine` is null until its own effect reads
   * localStorage too, so there is nothing to expire on the renders where the
   * clock is unknown.
   */
  const [now, setNow] = useState(null);
  useEffect(() => setNow(Date.now()), []);

  /**
   * ...moved on, once, at the moment something actually expires.
   *
   * The obvious version of this is an interval, and it is the wrong shape.
   * `now` is a dependency of the memo below, which is a dependency of the
   * merged `stories`, which is a dependency of the context value — so a
   * clock that ticks on a timer re-renders every screen holding `useStatus`
   * on that timer, forever, to discover nothing changed. A phone left on the
   * board overnight would do that a thousand times.
   *
   * A story has exactly one moment where its answer changes, and it is
   * known in advance: the oldest live update's `postedAt` plus the TTL. So
   * the clock sleeps until then and wakes once, which re-renders once, at
   * which point the next deadline is computed from what is left. With
   * nothing stored, or nothing left to expire, no timer is scheduled at all.
   *
   * The second of slack is so the timeout cannot land a millisecond early
   * and re-schedule itself in a tight loop; `STORY_TTL_MS` is 24 hours, well
   * inside `setTimeout`'s 24.8-day ceiling, so the delay never overflows.
   */
  useEffect(() => {
    if (now === null) return undefined;
    const stored = Array.isArray(storedMine?.updates) ? storedMine.updates : [];
    const next = stored
      .map((u) => (typeof u?.postedAt === "number" ? u.postedAt : null))
      .filter((at) => at !== null)
      .map((at) => at + STORY_TTL_MS)
      .filter((at) => at > now);
    if (!next.length) return undefined;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(...next) - now + 1000,
    );
    return () => clearTimeout(timer);
  }, [now, storedMine]);

  const myUpdates = useMemo(() => {
    const stored = Array.isArray(storedMine?.updates) ? storedMine.updates : [];
    if (now === null) return stored;
    return stored.filter((u) => isUpdateActive(u, now));
  }, [storedMine, now]);

  /**
   * ...and the same cut, written back to the store.
   *
   * Filtering on read is what makes an expired update invisible; this is
   * what stops it living in `localStorage` for the rest of the device's
   * life. The two are deliberately not one step — the filter has to keep
   * working on the render before this effect commits — but leaving only the
   * filter would mean a year of dead photos accumulating in a slot that is
   * never cleaned, each one a base64 data URI.
   *
   * Returns `prev` unchanged when nothing has expired, so the identity is
   * the same, React bails out of the re-render, and `usePersisted`'s
   * write-back effect never fires. Without that, every wake of the clock
   * above would rewrite the slot with what it already held.
   */
  useEffect(() => {
    if (now === null || !mineLoaded) return;
    setStoredMine((prev) => {
      const updates = Array.isArray(prev?.updates) ? prev.updates : [];
      const live = updates.filter((u) => isUpdateActive(u, now));
      return live.length === updates.length ? prev : { ...prev, updates: live };
    });
  }, [now, mineLoaded, setStoredMine]);

  const postStory = useCallback(
    (update) =>
      setStoredMine((prev) => {
        const updates = Array.isArray(prev?.updates) ? prev.updates : [];
        return { ...prev, updates: [...updates, update] };
      }),
    [setStoredMine],
  );

  const removeStory = useCallback(
    (updateId) =>
      setStoredMine((prev) => {
        const updates = Array.isArray(prev?.updates) ? prev.updates : [];
        return { ...prev, updates: updates.filter((u) => u.id !== updateId) };
      }),
    [setStoredMine],
  );

  /**
   * The seed with this device's own posts folded into the `own` story.
   *
   * Every screen that used to `import { stories } from "../data/mock"` reads
   * this instead, so there is one merged list rather than a seed in some
   * places and a seed-plus-posts in others. Newest first inside the own
   * story, matching the order the player advances in.
   */
  const stories = useMemo(() => {
    if (!myUpdates.length) return seedStories;
    return seedStories.map((story) =>
      story.own
        ? { ...story, updates: [...myUpdates, ...(story.updates ?? [])] }
        : story,
    );
  }, [myUpdates]);

  const value = useMemo(
    () => ({
      seen,
      // False until the stored ids land, which is one tick after hydration.
      ready,
      markSeen,
      clearSeen,
      isSeen: (id) => seen.includes(id),
      // This device's own reactions — never anyone else's, because there is
      // nowhere for anyone else's to come from.
      reactionsReady: reactionsHydrated,
      react,
      reactionFor: (storyId, updateId) =>
        reactionFor(reactions, storyId, updateId),
      // The seed with this device's own posts merged in, plus the two verbs
      // that change it. `myUpdates` is handed out on its own as well, because
      // the profile row wants a count and not the whole tray.
      stories,
      myUpdates,
      myStoryReady: mineLoaded,
      postStory,
      removeStory,
    }),
    [
      seen,
      ready,
      markSeen,
      clearSeen,
      reactions,
      reactionsHydrated,
      react,
      stories,
      myUpdates,
      mineLoaded,
      postStory,
      removeStory,
    ],
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
