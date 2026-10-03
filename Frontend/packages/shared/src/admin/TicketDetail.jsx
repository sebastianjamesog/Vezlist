"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import { getAdminTicket, replyAsStaff, setAdminTicketStatus } from "../lib/api/tickets.js";

export default function TicketDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setTicket(await getAdminTicket(id)); }
    catch (caught) { setError(caught); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function send(event) {
    event.preventDefault();
    if (!draft.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      setTicket(await replyAsStaff(id, draft.trim()));
      setDraft("");
      toast("Reply sent");
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  async function changeStatus() {
    setPending(true);
    setError(null);
    try {
      setTicket(await setAdminTicketStatus(id, ticket.status === "RESOLVED" ? "OPEN" : "RESOLVED"));
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  if (loading) return <p role="status" className="text-muted">Loading ticket…</p>;
  if (!ticket) return <><AdminHeader title="Ticket" back="/tickets" /><div role="alert" className={CARD}>{error?.status === 404 ? "Ticket not found." : "Could not load ticket."}<Button onClick={load}>Try again</Button></div></>;

  return (
    <>
      <AdminHeader title={ticket.subject} subtitle={`${ticket.ownerName} · ${ticket.site} · ${new Date(ticket.createdAt).toLocaleString()}`} back="/tickets" actions={<Button size="sm" variant="outline" disabled={pending} onClick={changeStatus}>{ticket.status === "RESOLVED" ? "Reopen" : "Mark resolved"}</Button>} />
      {error && <div role="alert" className={`${CARD} mb-4 text-danger`}>{error.message}</div>}
      <section className={CARD}>
        <p className="mb-4 text-sm font-semibold text-muted">{ticket.status}</p>
        <ol className="space-y-3">
          {ticket.messages.map((message) => (
            <li key={message.id} className={`flex ${message.staff ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.staff ? "bg-brand-soft" : "bg-canvas"}`}>
                <p className="mb-1 text-xs font-semibold text-muted">{message.senderName} · {new Date(message.createdAt).toLocaleString()}</p>
                <p className="whitespace-pre-wrap text-sm text-ink">{message.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <form onSubmit={send} className="mt-5 border-t border-line pt-4">
          <label htmlFor="staff-ticket-reply" className="text-sm font-semibold">Reply to member</label>
          <textarea id="staff-ticket-reply" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-ink" />
          <Button type="submit" size="sm" disabled={!draft.trim() || pending} className="mt-2">Send reply</Button>
        </form>
      </section>
    </>
  );
}
