"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { api } from "../lib/api";
import {
  createSavedState,
  dedupeSavedItems,
  isRemoteListingId,
  savedActions,
  savedListingToCard,
  savedListingsPath,
  savedStateReducer,
  savedStatusError,
  savedStatusPath,
} from "../lib/saved";
import { SITE } from "../lib/sites";
import { useAuth } from "./AuthContext";
import { SavedContext } from "./SavedStore";

const PAGE_SIZE = 24;
const EMPTY_ENTRY = Object.freeze({
  saved: false,
  known: false,
  pending: false,
  error: null,
});
const EMPTY_FEED = Object.freeze({
  sessionKey: null,
  items: [],
  nextCursor: null,
  hasMore: false,
  loading: false,
  loadingMore: false,
  loaded: false,
  error: null,
});

function requestError(error, fallback) {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.trim()) return new Error(error);
  return new Error(fallback);
}

function cardsFromPage(page) {
  return dedupeSavedItems(
    (page?.items ?? []).map((item) => savedListingToCard(item)),
  );
}

export function SavedProvider({ children }) {
  const { ready: authReady, signedIn, user } = useAuth();
  const sessionKey = signedIn ? String(user?.id ?? "") || null : null;

  return (
    <SavedSessionCache authReady={authReady} sessionKey={sessionKey}>
      {children}
    </SavedSessionCache>
  );
}

function SavedSessionCache({ authReady, children, sessionKey }) {
  const [savedState, dispatch] = useReducer(
    savedStateReducer,
    sessionKey,
    createSavedState,
  );
  const [feed, setFeed] = useState(EMPTY_FEED);
  const [statusMeta, setStatusMeta] = useState({});
  const savedStateRef = useRef(savedState);
  const feedRef = useRef(feed);
  const sessionRef = useRef(sessionKey);
  const feedVersion = useRef(0);
  const firstPageAbort = useRef(null);
  const statusRequests = useRef(new Map());
  const mutationRequests = useRef(new Map());
  const requestSequence = useRef(0);

  useEffect(() => {
    savedStateRef.current = savedState;
  }, [savedState]);

  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  const receiveStatuses = useCallback((items, totalCount) => {
    dispatch(savedActions.countReceived(totalCount));
    for (const item of items) {
      dispatch(
        savedActions.statusReceived(item.id, {
          saved: true,
          totalCount,
        }),
      );
    }
    setStatusMeta((all) => {
      const next = { ...all };
      for (const item of items) delete next[item.id];
      return next;
    });
  }, []);

  const loadFirstPage = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!sessionKey) return null;

      firstPageAbort.current?.abort();
      const controller = new AbortController();
      firstPageAbort.current = controller;
      const version = ++feedVersion.current;
      const requestSession = sessionKey;
      if (showLoading) {
        setFeed({ ...EMPTY_FEED, sessionKey, loading: true });
      } else {
        setFeed((current) => ({ ...current, error: null }));
      }

      try {
        const page = await api(
          savedListingsPath({ site: SITE, limit: PAGE_SIZE }),
          { signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          feedVersion.current !== version ||
          sessionRef.current !== requestSession
        ) {
          return null;
        }
        const items = cardsFromPage(page);
        setFeed({
          sessionKey,
          items,
          nextCursor: page.nextCursor ?? null,
          hasMore: Boolean(page.hasMore),
          loading: false,
          loadingMore: false,
          loaded: true,
          error: null,
        });
        receiveStatuses(items, page.totalCount);
        return page;
      } catch (error) {
        if (
          error.name === "AbortError" ||
          feedVersion.current !== version ||
          sessionRef.current !== requestSession
        ) {
          return null;
        }
        setFeed((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          error: requestError(error, "Could not load saved items."),
        }));
        return null;
      }
    },
    [receiveStatuses, sessionKey],
  );

  useEffect(() => {
    feedVersion.current += 1;
    firstPageAbort.current?.abort();
    sessionRef.current = sessionKey;
    const statusCache = statusRequests.current;
    const mutationCache = mutationRequests.current;
    statusCache.clear();
    mutationCache.clear();
    dispatch(savedActions.resetSession(sessionKey));
    const timer = window.setTimeout(() => {
      setStatusMeta({});
      setFeed({
        ...EMPTY_FEED,
        sessionKey,
        loading: Boolean(authReady && sessionKey),
      });
      if (authReady && sessionKey) {
        loadFirstPage({ showLoading: false });
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      feedVersion.current += 1;
      firstPageAbort.current?.abort();
      sessionRef.current = null;
      statusCache.clear();
      mutationCache.clear();
    };
  }, [authReady, loadFirstPage, sessionKey]);

  const retry = useCallback(() => loadFirstPage(), [loadFirstPage]);

  const loadMore = useCallback(async () => {
    const current = feedRef.current;
    const requestSession = sessionRef.current;
    if (
      !requestSession ||
      current.sessionKey !== requestSession ||
      !current.nextCursor ||
      current.loading ||
      current.loadingMore
    ) {
      return null;
    }

    const version = feedVersion.current;
    const cursor = current.nextCursor;
    setFeed((value) => ({ ...value, loadingMore: true, error: null }));
    try {
      const page = await api(
        savedListingsPath({
          site: SITE,
          limit: PAGE_SIZE,
          cursor,
        }),
      );
      if (
        feedVersion.current !== version ||
        sessionRef.current !== requestSession
      ) {
        return null;
      }
      const pageItems = cardsFromPage(page);
      setFeed((value) => ({
        ...value,
        items: dedupeSavedItems([...value.items, ...pageItems]),
        nextCursor: page.nextCursor ?? null,
        hasMore: Boolean(page.hasMore),
        loadingMore: false,
        loaded: true,
        error: null,
      }));
      receiveStatuses(pageItems, page.totalCount);
      return page;
    } catch (error) {
      if (
        feedVersion.current !== version ||
        sessionRef.current !== requestSession
      ) {
        return null;
      }
      setFeed((value) => ({
        ...value,
        loadingMore: false,
        error: requestError(error, "Could not load more saved items."),
      }));
      return null;
    }
  }, [receiveStatuses]);

  const hydrate = useCallback(
    (listingId, { force = false } = {}) => {
      if (!sessionKey) {
        return Promise.reject(new Error("Sign in to save this ad."));
      }
      if (!isRemoteListingId(listingId)) {
        return Promise.reject(new Error("This demo ad cannot be saved."));
      }

      const current =
        savedStateRef.current.sessionKey === sessionKey
          ? savedStateRef.current.byId[listingId]
          : null;
      if (!force && current?.known) {
        return Promise.resolve({
          listingId,
          saved: current.saved,
          totalCount: savedStateRef.current.totalCount,
        });
      }
      const existing = statusRequests.current.get(listingId);
      if (existing) return existing;

      const requestSession = sessionKey;
      setStatusMeta((all) => ({
        ...all,
        [listingId]: { loading: true, error: null },
      }));
      const request = api(savedStatusPath(listingId, SITE))
        .then((result) => {
          if (sessionRef.current === requestSession) {
            dispatch(savedActions.statusReceived(listingId, result));
          }
          return result;
        })
        .catch((error) => {
          const normalized = requestError(
            error,
            "Could not check this saved ad.",
          );
          if (sessionRef.current === requestSession) {
            setStatusMeta((all) => ({
              ...all,
              [listingId]: { loading: false, error: normalized },
            }));
          }
          throw normalized;
        })
        .finally(() => {
          if (statusRequests.current.get(listingId) === request) {
            statusRequests.current.delete(listingId);
          }
          if (sessionRef.current === requestSession) {
            setStatusMeta((all) => ({
              ...all,
              [listingId]: {
                loading: false,
                error: all[listingId]?.error ?? null,
              },
            }));
          }
        });
      statusRequests.current.set(listingId, request);
      return request;
    },
    [sessionKey],
  );

  const setSaved = useCallback(
    (listingId, nextSaved) => {
      if (!sessionKey) {
        return Promise.reject(new Error("Sign in to save this ad."));
      }
      if (!isRemoteListingId(listingId)) {
        return Promise.reject(new Error("This demo ad cannot be saved."));
      }
      if (savedStateRef.current.sessionKey !== sessionKey) {
        return Promise.reject(new Error("Saved items are still loading."));
      }

      const existing = mutationRequests.current.get(listingId);
      if (existing) return existing;

      const current = savedStateRef.current.byId[listingId] ?? EMPTY_ENTRY;
      const desired = Boolean(nextSaved);
      if (!current.known) {
        return Promise.reject(
          new Error("Check the saved status before updating this ad."),
        );
      }
      if (current.saved === desired) {
        return Promise.resolve({
          listingId,
          saved: desired,
          totalCount: savedStateRef.current.totalCount,
        });
      }

      const requestId = ++requestSequence.current;
      const requestSession = sessionKey;
      const previousFeed = feedRef.current;
      const removedIndex = previousFeed.items.findIndex(
        (item) => item.id === listingId,
      );
      const removedItem =
        removedIndex >= 0 ? previousFeed.items[removedIndex] : null;

      feedVersion.current += 1;
      firstPageAbort.current?.abort();
      dispatch(savedActions.optimisticSet(listingId, desired, requestId));
      setStatusMeta((all) => ({
        ...all,
        [listingId]: { loading: false, error: null },
      }));
      if (!desired && removedItem) {
        setFeed((value) => ({
          ...value,
          items: value.items.filter((item) => item.id !== listingId),
        }));
      }

      const request = api(savedStatusPath(listingId, SITE), {
        method: desired ? "POST" : "DELETE",
      })
        .then((result) => {
          if (sessionRef.current === requestSession) {
            dispatch(
              savedActions.mutationSucceeded(listingId, result, requestId),
            );
            if (!result.saved) {
              setFeed((value) => ({
                ...value,
                items: value.items.filter((item) => item.id !== listingId),
              }));
            }
            loadFirstPage({ showLoading: false });
          }
          return result;
        })
        .catch((error) => {
          const normalized = requestError(
            error,
            "Could not update this saved ad.",
          );
          if (sessionRef.current === requestSession) {
            dispatch(
              savedActions.mutationFailed(listingId, normalized, requestId),
            );
            if (!desired && removedItem) {
              setFeed((value) => {
                if (value.items.some((item) => item.id === listingId)) {
                  return value;
                }
                const items = [...value.items];
                items.splice(
                  Math.min(removedIndex, items.length),
                  0,
                  removedItem,
                );
                return { ...value, items: dedupeSavedItems(items) };
              });
            }
            loadFirstPage({ showLoading: false });
          }
          throw normalized;
        })
        .finally(() => {
          if (mutationRequests.current.get(listingId) === request) {
            mutationRequests.current.delete(listingId);
          }
        });
      mutationRequests.current.set(listingId, request);
      return request;
    },
    [loadFirstPage, sessionKey],
  );

  const status = useCallback(
    (listingId) => {
      if (savedState.sessionKey !== sessionKey) return EMPTY_ENTRY;
      const entry = savedState.byId[listingId] ?? EMPTY_ENTRY;
      const meta = statusMeta[listingId];
      const rawError = savedStatusError(entry, meta?.error);
      const error = rawError
        ? requestError(rawError, "Could not update this saved ad.")
        : null;
      return {
        ...entry,
        hydrating: Boolean(meta?.loading),
        error,
      };
    },
    [savedState.byId, savedState.sessionKey, sessionKey, statusMeta],
  );

  const isSaved = useCallback(
    (listingId) =>
      savedState.sessionKey === sessionKey &&
      Boolean(savedState.byId[listingId]?.saved),
    [savedState.byId, savedState.sessionKey, sessionKey],
  );
  const isPending = useCallback(
    (listingId) =>
      savedState.sessionKey === sessionKey &&
      Boolean(savedState.byId[listingId]?.pending),
    [savedState.byId, savedState.sessionKey, sessionKey],
  );

  const stateMatchesSession = savedState.sessionKey === sessionKey;
  const feedMatchesSession = feed.sessionKey === sessionKey;
  const visibleFeed = useMemo(
    () =>
      feedMatchesSession
        ? feed
        : {
            ...EMPTY_FEED,
            sessionKey,
            loading: Boolean(authReady && sessionKey),
          },
    [authReady, feed, feedMatchesSession, sessionKey],
  );
  const visibleCount = stateMatchesSession ? savedState.totalCount : null;

  const value = useMemo(
    () => ({
      items: visibleFeed.items,
      count: visibleCount ?? 0,
      countKnown: visibleCount != null,
      loading: visibleFeed.loading,
      loadingMore: visibleFeed.loadingMore,
      loaded: visibleFeed.loaded,
      error: visibleFeed.error,
      hasMore: visibleFeed.hasMore,
      retry,
      loadMore,
      status,
      hydrate,
      setSaved,
      isSaved,
      isPending,
    }),
    [
      visibleFeed,
      visibleCount,
      retry,
      loadMore,
      status,
      hydrate,
      setSaved,
      isSaved,
      isPending,
    ],
  );

  return (
    <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
  );
}
