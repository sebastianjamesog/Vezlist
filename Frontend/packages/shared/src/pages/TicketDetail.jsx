"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { useToast } from "../context/ToastContext";
import { useTickets } from "../context/TicketsContext";

export default function TicketDetail() {
  const { id } = useParams();
  const { get, reply } = useTickets();
  const toast = useToast();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTicket(await get(id));
    } catch (caught) {
      setError(caught);
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [get, id]);

  useEffect(() => { refresh(); }, [refresh]);

  async function send(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    try {
      setTicket(await reply(id, body));
      setDraft("");
      toast("Reply sent");
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (loading) return <p role="status" className="p-6 text-muted">Loading ticket…</p>;
  if (!ticket) {
    return (
      <>
        <SubPageBar title="Ticket" fallback="/support/tickets" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">{error?.status === 404 ? "That ticket doesn't exist." : "Could not load this ticket."}</p>
          {error?.status !== 404 && <button type="button" onClick={refresh} className="font-semibold text-brand underline">Try again</button>}
          <Link href="/support/tickets" className="text-[15px] font-semibold text-brand">Back to tickets</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <SubPageBar
        title={ticket.subject}
        subtitle={new Date(ticket.createdAt).toLocaleString()}
        fallback="/support/tickets"
        action={<span className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-[13px] font-semibold text-brand">{ticket.status === "RESOLVED" ? "Resolved" : "Open"}</span>}
      />
      <PageBody pinnedFooter width="max-w-3xl" className="px-4 pb-4 pt-4 lg:px-8 lg:py-6">
        <div className="space-y-3">
          {ticket.messages.map((message) => {
            const mine = !message.staff;
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] lg:max-w-[70%] ${mine ? "text-right" : ""}`}>
                  <p className="mb-1 text-[12px] font-semibold text-muted">{mine ? "You" : message.senderName} · {new Date(message.createdAt).toLocaleString()}</p>
                  <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${mine ? "rounded-br-md bg-brand text-on-brand" : "rounded-bl-md bg-surface text-ink shadow-card"}`}>{message.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </PageBody>
      <form onSubmit={send} className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-nav lg:px-8 lg:pb-3" aria-label="Reply to ticket">
        <div className="mx-auto flex w-full max-w-3xl gap-2">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply..." className="flex-1 rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-brand" />
          <button type="submit" disabled={!draft.trim() || pending} aria-label="Send reply" className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"><SendHorizontal className="size-5" /></button>
        </div>
        {error && <p role="alert" className="mx-auto mt-2 max-w-3xl text-sm text-danger">{error.message}</p>}
      </form>
    </>
  );
}
