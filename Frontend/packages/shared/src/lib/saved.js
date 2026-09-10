import { discoveryListingToCard } from "./discovery.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SAVED_ACTIONS = Object.freeze({
  RESET_SESSION: "saved/reset-session",
  COUNT_RECEIVED: "saved/count-received",
  STATUS_RECEIVED: "saved/status-received",
  OPTIMISTIC_SET: "saved/optimistic-set",
  MUTATION_SUCCEEDED: "saved/mutation-succeeded",
  MUTATION_FAILED: "saved/mutation-failed",
});

function requiredString(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function siteValue(site) {
  return requiredString(site, "site").toUpperCase();
}

function countValue(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : fallback;
}

function listingKey(item) {
  return item?.id ?? item?.listingId ?? item?.adId;
}

function actionListingId(action) {
  const value = action?.listingId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requestMatches(entry, action) {
  return (
    entry?.pending &&
    (action.requestId == null || entry.requestId === action.requestId)
  );
}

function withoutTransaction(entry) {
  const { requestId: _requestId, rollback: _rollback, ...settled } = entry;
  return settled;
}

export function savedStatusPath(id, site) {
  const listingId = requiredString(id, "listing id");
  const params = new URLSearchParams({ site: siteValue(site) });
  return `/listings/${encodeURIComponent(listingId)}/saved?${params}`;
}

export function savedListingsPath({ site, limit = 24, cursor } = {}) {
  const pageSize = Number(limit);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RangeError("limit must be an integer between 1 and 50");
  }

  const params = new URLSearchParams({
    site: siteValue(site),
    limit: String(pageSize),
  });
  if (cursor != null && String(cursor) !== "") {
    params.set("cursor", String(cursor));
  }
  return `/me/saved-listings?${params}`;
}

export function isRemoteListingId(id) {
  return typeof id === "string" && UUID_PATTERN.test(id.trim());
}

export function savedListingToCard(item, now = Date.now()) {
  return {
    ...discoveryListingToCard(item, now),
    savedAt: item.savedAt ?? null,
  };
}

export function dedupeSavedItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = listingKey(item);
    if (key == null) return true;
    const normalized = String(key);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function savedStatusError(entry, hydrationError) {
  if (entry?.error) return entry.error;
  return entry?.known ? null : (hydrationError ?? null);
}

export function createSavedState(sessionKey = null) {
  return {
    sessionKey,
    totalCount: null,
    byId: {},
  };
}

export const savedActions = Object.freeze({
  resetSession(sessionKey = null) {
    return { type: SAVED_ACTIONS.RESET_SESSION, sessionKey };
  },
  countReceived(totalCount) {
    return { type: SAVED_ACTIONS.COUNT_RECEIVED, totalCount };
  },
  statusReceived(listingId, { saved, totalCount }) {
    return {
      type: SAVED_ACTIONS.STATUS_RECEIVED,
      listingId,
      saved,
      totalCount,
    };
  },
  optimisticSet(listingId, saved, requestId) {
    return {
      type: SAVED_ACTIONS.OPTIMISTIC_SET,
      listingId,
      saved,
      requestId,
    };
  },
  mutationSucceeded(listingId, { saved, totalCount }, requestId) {
    return {
      type: SAVED_ACTIONS.MUTATION_SUCCEEDED,
      listingId,
      saved,
      totalCount,
      requestId,
    };
  },
  mutationFailed(listingId, error, requestId) {
    return {
      type: SAVED_ACTIONS.MUTATION_FAILED,
      listingId,
      error,
      requestId,
    };
  },
});

export function savedStateReducer(state, action) {
  switch (action.type) {
    case SAVED_ACTIONS.RESET_SESSION:
      return createSavedState(action.sessionKey ?? null);

    case SAVED_ACTIONS.COUNT_RECEIVED:
      return {
        ...state,
        totalCount: countValue(action.totalCount, state.totalCount),
      };

    case SAVED_ACTIONS.STATUS_RECEIVED: {
      const listingId = actionListingId(action);
      if (!listingId || state.byId[listingId]?.pending) return state;
      return {
        ...state,
        totalCount:
          state.totalCount ?? countValue(action.totalCount, state.totalCount),
        byId: {
          ...state.byId,
          [listingId]: {
            saved: Boolean(action.saved),
            known: true,
            pending: false,
            error: null,
          },
        },
      };
    }

    case SAVED_ACTIONS.OPTIMISTIC_SET: {
      const listingId = actionListingId(action);
      if (!listingId) return state;

      const previous = state.byId[listingId] ?? {
        saved: false,
        known: false,
        pending: false,
        error: null,
      };
      const saved = Boolean(action.saved);
      if (previous.pending || (previous.known && previous.saved === saved)) {
        return state;
      }

      const changesKnownStatus = previous.known && previous.saved !== saved;
      const optimisticCount = changesKnownStatus
        ? Math.max(0, state.totalCount + (saved ? 1 : -1))
        : state.totalCount;

      return {
        ...state,
        totalCount: state.totalCount == null ? null : optimisticCount,
        byId: {
          ...state.byId,
          [listingId]: {
            ...previous,
            saved,
            known: true,
            pending: true,
            error: null,
            requestId: action.requestId ?? null,
            rollback: {
              saved: previous.saved,
              known: previous.known,
              totalCount: state.totalCount,
            },
          },
        },
      };
    }

    case SAVED_ACTIONS.MUTATION_SUCCEEDED: {
      const listingId = actionListingId(action);
      const current = listingId ? state.byId[listingId] : null;
      if (!requestMatches(current, action)) return state;

      return {
        ...state,
        totalCount: countValue(action.totalCount, state.totalCount),
        byId: {
          ...state.byId,
          [listingId]: {
            ...withoutTransaction(current),
            saved: Boolean(action.saved),
            known: true,
            pending: false,
            error: null,
          },
        },
      };
    }

    case SAVED_ACTIONS.MUTATION_FAILED: {
      const listingId = actionListingId(action);
      const current = listingId ? state.byId[listingId] : null;
      if (!requestMatches(current, action)) return state;

      const rollback = current.rollback;
      return {
        ...state,
        totalCount: rollback.totalCount,
        byId: {
          ...state.byId,
          [listingId]: {
            ...withoutTransaction(current),
            saved: rollback.saved,
            known: rollback.known,
            pending: false,
            error: action.error ?? "Unable to update saved listing",
          },
        },
      };
    }

    default:
      return state;
  }
}
