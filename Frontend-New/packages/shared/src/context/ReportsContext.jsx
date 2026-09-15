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
import { EMPTY, isBlocked, reducer, reportOf } from "../lib/reports";
import { usePersistedObject } from "../lib/persisted";
import { useAuth } from "./AuthContext";
import { SITE } from "../lib/sites";

/**
 * The one place a report or a block is written.
 *
 * The ad detail page, the seller profile and the live viewer all report
 * through it, Settings reads the receipts and the blocked list back out of it,
 * and the two feed screens ask it who to leave out. Screens never call
 * `lib/reports.js` directly except for the pure `hideBlocked`, which is what
 * keeps a swap to a real API down to this file.
 *
 * What lands in storage is the delta — what this reader reported and who they
 * blocked — never a copy of a seed, the same shape `tickets.js` uses. There is
 * no seed here to copy: before this existed, the reports queue was fed by
 * static rows in `mock.js` and the public apps could not add to it at all.
 *
 * Where reports go, said once and repeated in every piece of copy that quotes
 * it: this origin's localStorage. The admin console is a third origin with a
 * separate store (#10), so nothing here reaches a moderator today, and no
 * screen in this app is allowed to say that it does.
 */
const ReportsContext = createContext(null);

const KEY = "vezlist:reports:v1";

export function ReportsProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, EMPTY);
  const [stored, setStored, loaded] = usePersistedObject(KEY);
  const [hydrated, setHydrated] = useState(false);
  const { user } = useAuth();

  /**
   * Read once, then never again — see `ListingsContext` for why the guard is
   * state rather than a ref: the write-back effect below runs on the very
   * render this flips, and a rehydrate that watched `stored` would answer its
   * own write forever.
   */
  useEffect(() => {
    if (!loaded || hydrated) return;
    if (stored) rawDispatch({ type: "rehydrate", state: stored });
    setHydrated(true);
  }, [loaded, hydrated, stored]);

  // ...and write back on every change afterwards, never before: writing on the
  // render `loaded` flips would persist `EMPTY` over the delta one line up is
  // about to rehydrate.
  useEffect(() => {
    if (!hydrated) return;
    setStored(state);
    // `setStored` is stable; `state` is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated]);

  /**
   * Who the queue will say raised this.
   *
   * A signed-out reader may still report — a scam ad is worth hearing about
   * from whoever is looking at it — and lands as "A member", which is what the
   * console's Reported-by column shows. Nothing is invented to fill the gap.
   */
  const reporter = user?.name ?? "A member";

  /**
   * `Date.now()` is read here, in the handler, never during render and never
   * inside `lib/reports.js`. Two reports cannot be filed inside the same
   * millisecond from one pair of hands, and the second one on a target is
   * refused by the reducer anyway.
   */
  const report = useCallback(
    ({ targetType, targetId, reasonId, detail }) => {
      const at = Date.now();
      rawDispatch({
        type: "report",
        id: `rep-${at.toString(36)}`,
        at,
        site: SITE,
        targetType,
        targetId,
        reasonId,
        detail,
        reporter,
      });
    },
    [reporter],
  );

  const block = useCallback(
    (id, name) => rawDispatch({ type: "block", id, name, at: Date.now() }),
    [],
  );

  const unblock = useCallback((id) => rawDispatch({ type: "unblock", id }), []);

  /**
   * Everything this reader reported or blocked, gone.
   *
   * Called by "Delete account" in Settings, which deletes everything this
   * build actually holds rather than only toasting. A rehydrate over `EMPTY`
   * is the same path storage takes on a browser that has never written here,
   * so there is no second way for the state to be empty.
   */
  const clear = useCallback(
    () => rawDispatch({ type: "rehydrate", state: EMPTY }),
    [],
  );

  const value = useMemo(
    () => ({
      reports: state.reports,
      blocked: state.blocked,
      // "showing what was stored", not "storage answered" — a screen gates on
      // this rather than rendering "not reported" and correcting itself a tick
      // later once the store comes back.
      ready: hydrated,
      report,
      block,
      unblock,
      clear,
      isBlocked: (id) => isBlocked(state.blocked, id),
      reportOf: (targetType, targetId) =>
        reportOf(state.reports, targetType, targetId),
    }),
    [state, hydrated, report, block, unblock, clear],
  );

  return (
    <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>
  );
}

export function useReports() {
  const ctx = useContext(ReportsContext);
  if (!ctx) throw new Error("useReports must be used inside <ReportsProvider>");
  return ctx;
}
