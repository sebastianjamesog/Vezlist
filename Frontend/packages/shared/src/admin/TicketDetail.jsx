"use client";

import { useParams } from "next/navigation";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useTicketConversation } from "../hooks/useTicketConversation.js";

export default function TicketDetail() {
  const { id } = useParams();
  const { admin } = useAdminAuth();
  const toast = useToast();
  const { ticket, loading, error, draft, setDraft, pending, refresh: load, send: sendReply, changeStatus, logRef } =
    useTicketConversation({ id, accountId: admin?.id, staff: true });

  async function send(event) {
    event.preventDefault();
    if (await sendReply()) toast("Reply sent");
  }

  if (loading)
    return (
      <p role="status" className="text-muted">
        Loading ticket…
      </p>
    );
  if (!ticket)
    return (
      <>
        <AdminHeader title="Ticket" back="/tickets" />
        <div role="alert" className={CARD}>
          {error?.status === 404
            ? "Ticket not found."
            : "Could not load ticket."}
          <Button onClick={load}>Try again</Button>
        </div>
      </>
    );

  return (
    <>
      <AdminHeader
        title={ticket.subject}
        subtitle={`${ticket.ownerName} · ${ticket.site} · ${new Date(ticket.createdAt).toLocaleString()}`}
        back="/tickets"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={changeStatus}
          >
            {ticket.status === "RESOLVED" ? "Reopen" : "Mark resolved"}
          </Button>
        }
      />
      {error && (
        <div role="alert" className={`${CARD} mb-4 text-danger`}>
          {error.message}
        </div>
      )}
      <section className={CARD}>
        <p className="mb-4 text-sm font-semibold text-muted">{ticket.status}</p>
        <ol ref={logRef} className="space-y-3" role="log" aria-label="Ticket conversation" aria-live="polite" aria-relevant="additions">
          {ticket.messages.map((message) => (
            <li
              key={message.id}
              className={`flex ${message.staff ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.staff ? "bg-brand-soft" : "bg-canvas"}`}
              >
                <p className="mb-1 text-xs font-semibold text-muted">
                  {message.senderName} ·{" "}
                  {new Date(message.createdAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap text-sm text-ink">
                  {message.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <form onSubmit={send} className="mt-5 border-t border-line pt-4">
          <label htmlFor="staff-ticket-reply" className="text-sm font-semibold">
            Reply to member
          </label>
          <textarea
            id="staff-ticket-reply"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            maxLength={4000}
            className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-ink"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!draft.trim() || pending}
            className="mt-2"
          >
            Send reply
          </Button>
        </form>
      </section>
    </>
  );
}
