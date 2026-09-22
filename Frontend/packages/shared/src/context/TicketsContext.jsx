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
import { EMPTY, merge, reducer } from "../lib/tickets";
import { usePersistedObject } from "../lib/persisted";

/**
 * The one place a ticket a user opens is kept.
 *
 * `Tickets` opens through it and `TicketDetail` reads through it, so the
 * ticket just created and the ticket the detail page shows are the same
 * object and cannot drift apart. See `lib/tickets.js` for why what lands in
 * storage is the delta a user creates, not a full copy of the seed.
 */
const TicketsContext = createContext(null);

const KEY = "vezlist:tickets:v1";

export function TicketsProvider({ children }) {
  const [created, rawDispatch] = useReducer(reducer, EMPTY);
  const [stored, setStored, loaded] = usePersistedObject(KEY);
  const [hydrated, setHydrated] = useState(false);

  /**
   * Read once, then never again — see `ListingsContext` for why the guard is
   * state rather than a ref: the write-back effect below runs on the very
   * render this flips, and a rehydrate that watched `stored` would answer
   * its own write forever.
   */
  useEffect(() => {
    if (!loaded || hydrated) return;
    if (stored) rawDispatch({ type: "rehydrate", state: stored });
    setHydrated(true);
  }, [loaded, hydrated, stored]);

  // ...and write back on every change afterwards, never before — the same
  // ordering `ListingsContext` uses, for the same reason: writing on the
  // render `loaded` flips would persist `EMPTY` over the delta one line up
  // is about to rehydrate.
  useEffect(() => {
    if (!hydrated) return;
    setStored(created);
    // `setStored` is stable; `created` is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created, hydrated]);

  /**
   * Opens a ticket and hands back its id so the caller can navigate to it.
   * `Date.now()` is read here, in the handler this runs from — never during
   * render or in `lib/tickets.js` — so two tickets opened in the same
   * millisecond are the one edge `listings.js` handles with a sequence
   * number and this one accepts: a human cannot submit this form twice
   * inside a millisecond, and the button disables itself the moment they try.
   */
  const open = useCallback(({ subject, body }) => {
    const id = String(Date.now());
    rawDispatch({ type: "create", id, subject, body });
    return id;
  }, []);

  const state = useMemo(() => merge(created), [created]);

  const value = useMemo(
    () => ({
      tickets: state.tickets,
      threads: state.threads,
      // "showing the stored tickets", not "storage answered" — the same
      // rule RequireAuth follows for the session: a screen gates on this
      // rather than rendering "not found" and correcting itself a tick
      // later once a ticket that only exists in this browser's storage
      // turns out to be real.
      ready: hydrated,
      open,
    }),
    [state, hydrated, open],
  );

  return (
    <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>
  );
}

export function useTickets() {
  const ctx = useContext(TicketsContext);
  if (!ctx) throw new Error("useTickets must be used inside <TicketsProvider>");
  return ctx;
}
