"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import * as ticketsApi from "../lib/api/tickets.js";

const TicketsContext = createContext(null);

function toRow(ticket) {
  return {
    id: ticket.id,
    ownerId: ticket.ownerId,
    title: ticket.subject,
    subject: ticket.subject,
    status: ticket.status === "RESOLVED" ? "Resolved" : "In Progress",
    meta: new Date(ticket.updatedAt).toLocaleDateString(),
    icon: "ReceiptText",
  };
}

export function TicketsProvider({ children }) {
  const { user, ready: authReady } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [nextOffset, setNextOffset] = useState(null);
  const requestSequence = useRef(0);
  const accountId = user?.id ?? null;

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!user) {
      setTickets([]);
      setNextOffset(null);
      setReady(true);
      return;
    }
    setError(null);
    try {
      const page = await ticketsApi.listTickets();
      if (sequence !== requestSequence.current) return;
      setTickets(page.items.map(toRow));
      setNextOffset(page.nextOffset);
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      setError(caught);
    } finally {
      if (sequence === requestSequence.current) setReady(true);
    }
  }, [accountId]);

  useEffect(() => {
    if (authReady) {
      setReady(false);
      refresh();
    }
  }, [authReady, refresh]);

  const loadMore = useCallback(async () => {
    if (nextOffset == null || !user) return;
    const sequence = requestSequence.current;
    try {
      const page = await ticketsApi.listTickets({ offset: nextOffset });
      if (sequence !== requestSequence.current) return;
      setTickets((current) => [...current, ...page.items.map(toRow)]);
      setNextOffset(page.nextOffset);
    } catch (caught) {
      if (sequence === requestSequence.current) setError(caught);
    }
  }, [nextOffset, accountId]);

  const open = useCallback(async ({ subject, body }) => {
    const ticket = await ticketsApi.createTicket({ subject, body });
    setTickets((current) => [toRow(ticket), ...current]);
    return ticket.id;
  }, []);

  const visibleTickets = useMemo(() => tickets.filter((ticket) => ticket.ownerId === accountId), [tickets, accountId]);
  const value = useMemo(() => ({
    tickets: visibleTickets, ready, error, nextOffset, refresh, loadMore, open,
    get: ticketsApi.getTicket,
    reply: ticketsApi.replyToTicket,
  }), [visibleTickets, ready, error, nextOffset, refresh, loadMore, open]);

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>;
}

export function useTickets() {
  const context = useContext(TicketsContext);
  if (!context) throw new Error("useTickets must be used inside <TicketsProvider>");
  return context;
}
