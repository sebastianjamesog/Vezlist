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
import { useAuth } from "./AuthContext";
import { useTicketEvents } from "../hooks/useTicketEvents.js";
import * as ticketsApi from "../lib/api/tickets.js";

const TicketsContext = createContext(null);
const PAGE_SIZE = 50;

function toRow(ticket) {
  return {
    id: ticket.id,
    ownerId: ticket.ownerId,
    title: ticket.subject,
    subject: ticket.subject,
    status: ticket.status === "RESOLVED" ? "Resolved" : "In Progress",
    meta: new Date(ticket.updatedAt).toLocaleDateString(),
    icon: "ReceiptText",
    unreadCount: Math.max(0, Number(ticket.unreadCount) || 0),
  };
}

export function TicketsProvider({ children }) {
  const { user, ready: authReady } = useAuth();
  const accountId = user?.id ?? null;
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const [tickets, setTickets] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [nextOffset, setNextOffset] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestSequence = useRef(0);
  const pagination = useRef({ accountId, pages: 1, loadingMore: false });
  if (pagination.current.accountId !== accountId) {
    pagination.current = { accountId, pages: 1, loadingMore: false };
  }

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!accountId) return;
    const pageCount = pagination.current.pages;
    setError(null);
    try {
      const items = new Map();
      let offset = 0;
      let next = null;
      for (let index = 0; index < pageCount; index++) {
        const page = await ticketsApi.listTickets({ limit: PAGE_SIZE, offset });
        if (
          sequence !== requestSequence.current ||
          currentAccount.current !== accountId
        )
          return;
        page.items.forEach((ticket) => items.set(ticket.id, toRow(ticket)));
        next = page.nextOffset;
        if (next == null) break;
        offset = next;
      }
      setTickets([...items.values()]);
      setNextOffset(next);
    } catch (caught) {
      if (
        sequence !== requestSequence.current ||
        currentAccount.current !== accountId
      )
        return;
      setError(caught);
    } finally {
      if (
        sequence === requestSequence.current &&
        currentAccount.current === accountId
      ) {
        pagination.current.loadingMore = false;
        setLoadingMore(false);
        setReady(true);
      }
    }
  }, [accountId]);

  useEffect(() => {
    setTickets([]);
    setNextOffset(null);
    setError(null);
    setLoadingMore(false);
    setReady(authReady && !accountId);
    if (authReady && accountId) refresh();
    return () => {
      requestSequence.current++;
    };
  }, [authReady, accountId, refresh]);

  useTicketEvents({
    accountId: authReady ? accountId : null,
    onChange: refresh,
  });

  const loadMore = useCallback(async () => {
    if (nextOffset == null || !accountId || pagination.current.loadingMore)
      return;
    pagination.current.loadingMore = true;
    pagination.current.pages++;
    setLoadingMore(true);
    // Reload the full visible range: offset pagination can shift when a reply
    // moves a ticket to the top. Replacing this range also removes duplicates.
    await refresh();
  }, [nextOffset, accountId, refresh]);

  const open = useCallback(
    async ({ subject, body }) => {
      const startedFor = accountId;
      const ticket = await ticketsApi.createTicket({ subject, body });
      if (currentAccount.current !== startedFor) {
        throw new Error("Your account changed. Open your tickets to continue.");
      }
      setTickets((current) => [
        toRow(ticket),
        ...current.filter((row) => row.id !== ticket.id),
      ]);
      return ticket.id;
    },
    [accountId],
  );

  const visibleTickets = useMemo(
    () => tickets.filter((ticket) => ticket.ownerId === accountId),
    [tickets, accountId],
  );
  const value = useMemo(
    () => ({
      tickets: visibleTickets,
      ready,
      error,
      nextOffset,
      loadingMore,
      refresh,
      loadMore,
      open,
      get: ticketsApi.getTicket,
      reply: ticketsApi.replyToTicket,
    }),
    [
      visibleTickets,
      ready,
      error,
      nextOffset,
      loadingMore,
      refresh,
      loadMore,
      open,
    ],
  );

  return (
    <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>
  );
}

export function useTickets() {
  const context = useContext(TicketsContext);
  if (!context)
    throw new Error("useTickets must be used inside <TicketsProvider>");
  return context;
}
