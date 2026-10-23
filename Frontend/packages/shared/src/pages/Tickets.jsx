"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { useNavigate } from "../lib/nav";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import Field, { FIELD, border } from "../components/create/Field";
import { useToast } from "../context/ToastContext";
import { useTickets } from "../context/TicketsContext";

const tabs = [
  { value: "all", label: "All" },
  { value: "In Progress", label: "Open" },
  { value: "Resolved", label: "Resolved" },
];

const EMPTY_TICKET = { subject: "", body: "" };

function validateTicket({ subject, body }) {
  const errors = {};
  if (!subject.trim()) errors.subject = "Give it a subject.";
  if (!body.trim()) errors.body = "Say what's going on.";
  return errors;
}

export default function Tickets() {
  const toast = useToast();
  const navigate = useNavigate();
  const {
    tickets,
    ready,
    error,
    refresh,
    nextOffset,
    loadingMore,
    loadMore,
    open,
  } = useTickets();
  const [tab, setTab] = useState("all");
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState(EMPTY_TICKET);
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const rows =
    tab === "all" ? tickets : tickets.filter((t) => t.status === tab);

  const patch = (next) => {
    setForm((f) => ({ ...f, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      Object.keys(next).forEach((k) => delete cleared[k]);
      return cleared;
    });
  };

  /**
   * `open` writes through TicketsContext, which persists the ticket (see
   * lib/tickets.js) rather than pushing into the imported mock module the
   * way this used to — that only ever changed this tab's copy of it, gone on
   * reload and never touched on the server that renders the detail page's
   * id straight off the URL.
   */
  async function submitTicket(e) {
    e.preventDefault();
    const found = validateTicket(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setPending(true);
    try {
      const id = await open(form);
      setForm(EMPTY_TICKET);
      setComposing(false);
      toast("Ticket opened");
      navigate(`/support/tickets/${id}`);
    } catch (caught) {
      setErrors({
        body: caught.message || "Could not open the ticket. Try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SubPageBar
        title="Support Tickets"
        subtitle={`${tickets.length} total`}
        fallback="/support"
        action={
          <button
            onClick={() => setComposing(true)}
            aria-label="New ticket"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-brand shadow-card transition-transform hover:scale-105 active:scale-95"
          >
            <Plus className="size-5" strokeWidth={2.6} />
          </button>
        }
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <div className="mb-4 flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line lg:max-w-md">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              aria-pressed={tab === t.value}
              className={`flex-1 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                tab === t.value
                  ? "bg-brand text-on-brand"
                  : "text-ink hover:bg-canvas"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && rows.length > 0 && (
          <p role="alert" className="mb-3 text-sm text-danger">
            Could not update tickets.{" "}
            <button type="button" onClick={refresh} className="underline">
              Try again
            </button>
          </p>
        )}
        {!ready ? (
          <p role="status" className="text-muted">
            Loading tickets…
          </p>
        ) : error && !rows.length ? (
          <div role="alert" className="rounded-card bg-surface p-5 shadow-card">
            <p>Could not load tickets.</p>
            <Button onClick={refresh} variant="soft">
              Try again
            </Button>
          </div>
        ) : rows.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((t) => (
              <Link
                key={t.id}
                href={`/support/tickets/${t.id}`}
                className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-lift"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                  <Icon name={t.icon} className="size-5" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold leading-tight text-ink">
                    {t.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted">
                    {t.meta}
                  </span>
                </span>
                {t.unreadCount > 0 && (
                  <span
                    aria-label={`${t.unreadCount} unread messages`}
                    className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-on-brand"
                  >
                    {t.unreadCount > 99 ? "99+" : t.unreadCount}
                  </span>
                )}
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                    t.status === "Resolved"
                      ? "bg-canvas text-muted"
                      : "bg-brand-soft text-brand"
                  }`}
                >
                  {t.status}
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="ReceiptText"
            title="No tickets here"
            body="Nothing in this status yet."
            action={
              <Button variant="soft" onClick={() => setComposing(true)}>
                New ticket
              </Button>
            }
          />
        )}
        {nextOffset != null && (
          <Button
            variant="soft"
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-4"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        )}
      </PageBody>

      <Modal
        open={composing}
        title="New ticket"
        subtitle="Tell us what's going on — a support agent replies here."
        onClose={() => setComposing(false)}
        size="max-w-md"
        footer={
          <Button
            type="submit"
            form="new-ticket"
            size="lg"
            className="w-full"
            disabled={pending}
          >
            {pending ? "Opening…" : "Open ticket"}
          </Button>
        }
      >
        <form
          id="new-ticket"
          onSubmit={submitTicket}
          noValidate
          className="space-y-4"
        >
          <Field label="Subject" error={errors.subject}>
            <input
              value={form.subject}
              onChange={(e) => patch({ subject: e.target.value })}
              className={`${FIELD} ${border(errors.subject)}`}
              placeholder="What's this about?"
            />
          </Field>

          <Field label="Message" error={errors.body}>
            <textarea
              rows={4}
              value={form.body}
              onChange={(e) => patch({ body: e.target.value })}
              className={`${FIELD} ${border(errors.body)} resize-none`}
              placeholder="Give us the details."
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
