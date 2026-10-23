"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as ticketsApi from "../lib/api/tickets.js";
import { SITE_SCOPE } from "../lib/api/client.js";
import { useTicketEvents } from "./useTicketEvents.js";

/** Serialize refreshes and mutations, keeping drafts and the visible thread intact. */
export function useTicketConversation({ id, accountId, staff = false }) {
  const context = useRef(null);
  const logRef = useRef(null);
  const followsLatest = useRef(true);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const key = `${staff}:${accountId}:${id}`;
  const ticket = snapshot?.key === key ? snapshot.ticket : null;

  const load = useCallback(async (ctx) => {
    if (!ctx || ctx !== context.current) return;
    ctx.dirty = true;
    if (ctx.loading || ctx.mutating) return;
    ctx.loading = true;
    do {
      ctx.dirty = false;
      const revision = ctx.revision;
      try {
        const result = await (staff ? ticketsApi.getAdminTicket(id) : ticketsApi.getTicket(id));
        if (ctx !== context.current) return;
        // A mutation started while this request was in flight: don't replace its result.
        if (!ctx.mutating && revision === ctx.revision) {
          setSnapshot({ key, ticket: result });
          setError(null);
        }
      } catch (caught) {
        if (ctx !== context.current) return;
        if (!ctx.mutating && revision === ctx.revision) {
          setError(caught);
          if (caught.status === 401 || caught.status === 403 || caught.status === 404) setSnapshot(null);
        }
      } finally {
        if (ctx === context.current) setLoading(false);
      }
    } while (ctx === context.current && ctx.dirty && !ctx.mutating);
    ctx.loading = false;
  }, [key, staff, id]);

  const refresh = useCallback(() => load(context.current), [load]);
  useEffect(() => {
    const ctx = { key, loading: false, mutating: false, dirty: false, revision: 0 };
    context.current = ctx;
    setSnapshot(null);
    setLoading(Boolean(accountId));
    setError(null);
    setActionError(null);
    setDraft("");
    setPending(false);
    if (accountId) load(ctx);
    return () => { if (context.current === ctx) context.current = null; };
  }, [key, accountId, load]);

  useTicketEvents({ staff, site: staff ? ticket?.site : SITE_SCOPE, accountId,
    onChange: (event) => { if (!event.ticketId || event.ticketId === id) refresh(); },
  });

  // Read only the message boundary actually rendered in this visible conversation.
  // Never use the read response as a snapshot: newer replies may have arrived meanwhile.
  const lastMessageId = ticket?.messages?.at(-1)?.id;
  useLayoutEffect(() => {
    followsLatest.current = true;
    const container = logRef.current?.closest("[data-scroll]");
    if (!container) return;
    const onScroll = () => {
      followsLatest.current = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [key, Boolean(ticket)]);
  useLayoutEffect(() => {
    // Follow the conversation unless the reader has scrolled up into its history.
    if (followsLatest.current) logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [lastMessageId]);
  useEffect(() => {
    if (!ticket?.unreadCount || !lastMessageId) return;
    const ctx = context.current;
    let sending = false;
    const markRead = async () => {
      if (document.visibilityState === "hidden" || sending || ctx !== context.current) return;
      sending = true;
      try {
        await ticketsApi.markTicketRead(id, lastMessageId, { staff });
      } catch { /* Reconciliation or returning to the tab retries a failed receipt. */ }
      finally { sending = false; }
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [ticket, lastMessageId, id, staff]);

  const mutate = async (action) => {
    const ctx = context.current;
    if (!ctx || ctx.key !== key || ctx.mutating) return false;
    ctx.mutating = true;
    ctx.revision++;
    setPending(true);
    setActionError(null);
    try {
      const result = await action();
      if (ctx !== context.current) return false;
      setSnapshot({ key, ticket: result });
      return true;
    } catch (caught) {
      if (ctx === context.current) setActionError(caught);
      return false;
    } finally {
      ctx.mutating = false;
      if (ctx === context.current) {
        setPending(false);
        // Reconcile any reply/status that committed during this write.
        load(ctx);
      }
    }
  };

  async function send() {
    const submittedDraft = draft;
    const body = submittedDraft.trim();
    if (!body) return false;
    const sent = await mutate(() => staff ? ticketsApi.replyAsStaff(id, body) : ticketsApi.replyToTicket(id, body));
    if (sent) setDraft((current) => current === submittedDraft ? "" : current);
    return sent;
  }

  async function changeStatus() {
    if (staff && ticket) await mutate(() => ticketsApi.setAdminTicketStatus(id, ticket.status === "RESOLVED" ? "OPEN" : "RESOLVED"));
  }

  return { ticket, loading, error: actionError || error, draft, setDraft, pending, refresh, send, changeStatus, logRef };
}
