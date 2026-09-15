"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import StatusBadge from "../components/admin/StatusBadge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminData } from "../context/AdminDataContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";

/**
 * The agent side of a support thread.
 *
 * `ticketThreads` already models `from: "agent"`, so the reply box appends to
 * a shape that exists rather than inventing one — which is why the same thread
 * renders on the public site with no translation in between.
 */
export default function TicketDetail() {
  const { id } = useParams();
  const { state, dispatch } = useAdminData();
  const { admin } = useAdminAuth();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [canned, setCanned] = useState("");

  const ticket = state.tickets.find((t) => t.id === id);

  if (!ticket) {
    return (
      <>
        <AdminHeader title="Ticket" back="/tickets" backLabel="All tickets" />
        <EmptyState
          icon="SearchX"
          title="No such ticket"
          body="It was closed out of the store, or the link is stale."
          action={
            <Button to="/tickets" size="sm">
              Back to tickets
            </Button>
          }
        />
      </>
    );
  }

  // Only an unanswered ticket can be late. One that has been replied to is
  // waiting on the requester, and blaming the agent for that is a false alarm.
  const slaMs = (state.settings.ticketSlaHours ?? 24) * 3_600_000;
  const overdue =
    ticket.status === "open" &&
    ticket.messages.at(-1)?.from !== "agent" &&
    ticket.openedMsAgo > slaMs;

  const assignee = state.admins.find((a) => a.id === ticket.assigneeId);

  function send(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    dispatch({ type: "replyTicket", id: ticket.id, body: draft });
    setDraft("");
    setCanned("");
    toast("Reply sent");
  }

  function setStatus(status) {
    dispatch({ type: "setTicketStatus", id: ticket.id, status });
    toast(status === "resolved" ? "Ticket resolved" : "Ticket reopened");
  }

  return (
    <>
      <AdminHeader
        title={ticket.subject}
        subtitle={`#${ticket.id} · ${ticket.requester} · ${ticket.opened}`}
        back="/tickets"
        backLabel="All tickets"
        actions={
          ticket.status === "resolved" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus("open")}
            >
              Reopen
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStatus("resolved")}>
              Mark resolved
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${CARD} lg:col-span-2`}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            {overdue && <StatusBadge status="rejected" label="Overdue" dot />}
            {assignee ? (
              <span className="text-[13px] text-muted">
                Assigned to{" "}
                <span className="font-semibold text-ink">{assignee.name}</span>
              </span>
            ) : (
              <span className="text-[13px] text-muted">Unassigned</span>
            )}
            <span className="text-[13px] text-muted">
              · {ticket.messages.length} messages
            </span>
          </div>

          <ol className="flex flex-col gap-3">
            {ticket.messages.map((message) => {
              const agent = message.from === "agent";
              return (
                <li
                  key={message.id}
                  // The agent is "us" here, so the console mirrors the public
                  // thread: their side left, ours right.
                  className={`flex ${agent ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      agent ? "bg-brand-soft text-ink" : "bg-canvas text-ink"
                    }`}
                  >
                    <p className="mb-1 text-[12px] font-bold text-muted">
                      {message.author} · {message.time}
                    </p>
                    <p className="whitespace-pre-line text-[14px] leading-relaxed">
                      {message.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <form onSubmit={send} className="mt-4 border-t border-line pt-4">
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="ticket-reply"
                className="text-[14px] font-bold text-ink"
              >
                Reply as {admin?.name}
              </label>
              {/* Canned replies fill the box rather than sending — the agent
                  still reads it and still edits the details in. */}
              <select
                value={canned}
                aria-label="Insert a canned reply"
                onChange={(e) => {
                  const pick = state.cannedReplies.find(
                    (r) => r.id === e.target.value,
                  );
                  setCanned(e.target.value);
                  if (pick) setDraft(pick.body);
                }}
                className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] font-semibold text-ink outline-none"
              >
                <option value="">Canned reply…</option>
                {state.cannedReplies.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              id="ticket-reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="The refund is approved and should land in 3-5 business days."
              className={`${FIELD} ${border(false)} resize-none`}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[12.5px] text-muted">
                Replying to a resolved ticket reopens it.
              </p>
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                <SendHorizontal className="size-4" strokeWidth={2.4} />
                Send
              </Button>
            </div>
          </form>
        </section>

        <section className={CARD}>
          <h2 className="mb-3 text-[17px] font-extrabold text-ink">Context</h2>
          <dl className="flex flex-col gap-3 text-[14px]">
            <Row label="Requester" value={ticket.requester} />
            <Row label="Site" value={ticket.site} />
            <Row label="Opened" value={ticket.opened} />
            <Row
              label="Status"
              value={<StatusBadge status={ticket.status} />}
            />
          </dl>

          <div className="mt-4 border-t border-line pt-4">
            <Field
              label="Assigned to"
              hint={overdue ? "Past the review target" : undefined}
            >
              <select
                value={ticket.assigneeId ?? ""}
                onChange={(e) => {
                  dispatch({
                    type: "assignTicket",
                    id: ticket.id,
                    adminId: e.target.value || null,
                  });
                  toast(
                    e.target.value ? "Ticket assigned" : "Ticket unassigned",
                  );
                }}
                className={`${FIELD} ${border(false)}`}
              >
                <option value="">Unassigned</option>
                {state.admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
      </div>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-semibold capitalize text-ink">{value}</dd>
    </div>
  );
}
