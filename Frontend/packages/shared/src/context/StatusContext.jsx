"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { usePersistedIds, usePersistedObject } from "../lib/persisted";
import { EMPTY_REACTIONS, reactionFor, reactionsReducer } from "../lib/status";
import { IS_PERSONALS } from "../lib/sites";
import * as storiesApi from "../lib/api/stories";

const StatusContext = createContext(null);

/** Server media is never persisted in browser storage. Seen/reactions remain device-only. */
export function StatusProvider({ children }) {
  const { user, ready: authReady } = useAuth();
  const userId = user?.id ?? null;
  const canManage = user?.accountType === "CREATOR";
  const [seen, setSeen, seenReady] = usePersistedIds(
    "vezlist:status-seen:v1",
    "vezlist:status-seen",
  );
  const markSeen = useCallback(
    (id) =>
      setSeen((previous) =>
        previous.includes(id) ? previous : [...previous, id],
      ),
    [setSeen],
  );
  const clearSeen = useCallback(() => setSeen([]), [setSeen]);
  const [reactions, dispatch] = useReducer(reactionsReducer, EMPTY_REACTIONS);
  const [storedReactions, setStoredReactions, reactionsLoaded] =
    usePersistedObject("vezlist:status-reactions:v1");
  const [reactionsHydrated, setReactionsHydrated] = useState(false);
  useEffect(() => {
    if (!reactionsLoaded || reactionsHydrated) return;
    if (storedReactions)
      dispatch({ type: "rehydrate", state: storedReactions });
    setReactionsHydrated(true);
  }, [reactionsLoaded, reactionsHydrated, storedReactions]);
  useEffect(() => {
    if (reactionsHydrated) setStoredReactions(reactions);
  }, [reactions, reactionsHydrated, setStoredReactions]);
  const react = useCallback(
    (storyId, updateId, emoji) =>
      dispatch({ type: "react", storyId, updateId, emoji }),
    [],
  );

  const [feed, setFeed] = useState([]);
  const [extra, setExtra] = useState({});
  const [mine, setMine] = useState({ ownerId: null, items: [], credits: 0 });
  const [loadedFor, setLoadedFor] = useState(undefined);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(null);
  const request = useRef(0);
  const creatorIds = useRef(new Set());

  const refreshStories = useCallback(async () => {
    if (!authReady) return;
    const sequence = ++request.current;
    if (!IS_PERSONALS) {
      setLoadedFor(userId);
      return;
    }
    const owners = [...creatorIds.current];
    const [publicResult, ownResult, ...creatorResults] =
      await Promise.allSettled([
        storiesApi.listStories({ limit: 100 }),
        userId && canManage
          ? storiesApi.listMyStories()
          : Promise.resolve({ items: [], credits: 0 }),
        ...owners.map((owner) => storiesApi.listCreatorStories(owner)),
      ]);
    if (sequence !== request.current) return;
    const failed =
      publicResult.status === "rejected"
        ? publicResult.reason
        : ownResult.status === "rejected"
          ? ownResult.reason
          : null;
    if (publicResult.status === "fulfilled")
      setFeed(publicResult.value.items ?? []);
    if (ownResult.status === "fulfilled")
      setMine({ ownerId: userId, ...ownResult.value });
    setExtra((previous) => {
      const next = { ...previous };
      creatorResults.forEach((result, index) => {
        if (
          result.status === "fulfilled" &&
          creatorIds.current.has(owners[index])
        )
          next[owners[index]] = result.value.items ?? [];
      });
      return next;
    });
    setError(
      failed
        ? failed.message || "Stories could not be loaded. Please try again."
        : null,
    );
    setLoadedFor(userId);
    setNow(Date.now());
  }, [authReady, userId, canManage]);

  useEffect(() => {
    refreshStories();
    const timer = setInterval(refreshStories, 60_000);
    window.addEventListener("focus", refreshStories);
    return () => {
      ++request.current;
      clearInterval(timer);
      window.removeEventListener("focus", refreshStories);
    };
  }, [refreshStories]);

  const loadCreatorStories = useCallback(async (ownerId) => {
    creatorIds.current.add(ownerId);
    // Keep a bounded cache of direct links outside the public feed's first page.
    if (creatorIds.current.size > 10)
      creatorIds.current.delete(creatorIds.current.values().next().value);
    const result = await storiesApi.listCreatorStories(ownerId);
    setExtra((previous) =>
      Object.fromEntries(
        Object.entries({ ...previous, [ownerId]: result.items ?? [] }).filter(
          ([owner]) => creatorIds.current.has(owner),
        ),
      ),
    );
    setNow(Date.now());
    return result;
  }, []);

  const ownItems = useMemo(
    () => (mine.ownerId === userId && userId ? mine.items : []),
    [mine, userId],
  );
  const rows = useMemo(() => {
    const unique = new Map();
    for (const item of feed) unique.set(item.id, item);
    // A direct creator fetch replaces that owner's feed rows, including deletions.
    for (const [ownerId, items] of Object.entries(extra)) {
      for (const [id, item] of unique)
        if (item.ownerId === ownerId) unique.delete(id);
      for (const item of items) unique.set(item.id, item);
    }
    if (mine.ownerId === userId && userId && canManage) {
      for (const [id, item] of unique)
        if (item.ownerId === userId) unique.delete(id);
      for (const item of ownItems) unique.set(item.id, item);
    }
    return [...unique.values()];
  }, [feed, extra, ownItems, mine.ownerId, userId, canManage]);

  // Expire even when an open tab has lost its network connection.
  useEffect(() => {
    if (now === null) return;
    const deadlines = rows
      .filter((row) => row.status === "PUBLISHED")
      .map((row) => Date.parse(row.expiresAt))
      .filter((time) => time > now);
    if (!deadlines.length) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(1, Math.min(...deadlines) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [rows, now]);

  const stories = useMemo(() => {
    const groups = new Map();
    if (userId)
      groups.set(userId, {
        id: "me",
        ownerId: userId,
        name: user.name,
        own: true,
        avatar: null,
        updates: [],
        msAgo: 0,
      });
    if (now === null) return [...groups.values()];
    const active = rows
      .filter(
        (row) =>
          row.status === "PUBLISHED" &&
          Date.parse(row.expiresAt) > now &&
          row.mediaUrl,
      )
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    for (const row of active) {
      const own = row.ownerId === userId;
      const age = Math.max(0, now - Date.parse(row.publishedAt));
      if (!groups.has(row.ownerId))
        groups.set(row.ownerId, {
          id: row.ownerId,
          ownerId: row.ownerId,
          name: row.creatorName || "Creator",
          own,
          avatar: row.avatarUrl,
          msAgo: age,
          updates: [],
        });
      const group = groups.get(row.ownerId);
      if (!group.avatar)
        group.avatar =
          row.avatarUrl || (row.mediaType === "IMAGE" ? row.mediaUrl : null);
      group.updates.push({
        id: row.id,
        mediaType: row.mediaType,
        image: row.mediaType === "IMAGE" ? row.mediaUrl : null,
        video: row.mediaType === "VIDEO" ? row.mediaUrl : null,
        postedAt: Date.parse(row.publishedAt),
        expiresAt: Date.parse(row.expiresAt),
        msAgo: age,
        caption: "",
      });
    }
    return [...groups.values()];
  }, [rows, userId, user, now]);

  const removeStory = useCallback(async (id) => {
    await storiesApi.deleteStory(id);
    setFeed((previous) => previous.filter((item) => item.id !== id));
    setMine((previous) => ({
      ...previous,
      items: previous.items.filter((item) => item.id !== id),
    }));
    setExtra((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([owner, items]) => [
          owner,
          items.filter((item) => item.id !== id),
        ]),
      ),
    );
  }, []);
  const myUpdates = useMemo(
    () => stories.find((story) => story.own)?.updates ?? [],
    [stories],
  );
  const dataReady = authReady && loadedFor === userId;
  const value = useMemo(
    () => ({
      seen,
      ready: seenReady && dataReady,
      markSeen,
      clearSeen,
      isSeen: (id) => seen.includes(id),
      reactionsReady: reactionsHydrated,
      react,
      reactionFor: (storyId, updateId) =>
        reactionFor(reactions, storyId, updateId),
      stories,
      myUpdates,
      myStoryReady: dataReady,
      canManage,
      credits:
        canManage && mine.ownerId === userId && userId ? mine.credits : 0,
      error,
      refreshStories,
      loadCreatorStories,
      removeStory,
    }),
    [
      seen,
      seenReady,
      dataReady,
      markSeen,
      clearSeen,
      reactionsHydrated,
      react,
      reactions,
      stories,
      myUpdates,
      mine,
      userId,
      canManage,
      error,
      refreshStories,
      loadCreatorStories,
      removeStory,
    ],
  );

  return (
    <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
  );
}

export function useStatus() {
  const context = useContext(StatusContext);
  if (!context)
    throw new Error("useStatus must be used inside <StatusProvider>");
  return context;
}
