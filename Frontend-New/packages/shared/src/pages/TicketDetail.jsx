"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { useToast } from "../context/ToastContext";
import { useTickets } from "../context/TicketsContext";

export default function TicketDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { threads, ready } = useTickets();
  const thread = threads[id];
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");

  /**
   * A ticket opened in this browser only becomes visible once TicketsContext
   * has actually read storage — before that, `threads` holds the seed alone,
   * so `thread` for a freshly created id starts out undefined and turns up a
   * tick later. `messages` is seeded from it here, adjusted during render
   * rather than a tick after it in an effect — React's own pattern for state
   * derived from a prop that can change out from under the component — so it
   * is never one render behind whichever `thread` just became available.
   */
  const [seededFrom, setSeededFrom] = useState(null);
  if (thread && seededFrom !== thread) {
    setSeededFrom(thread);
    setMessages(thread.messages);
  }

  if (!thread) {
    // A seed ticket (1234, 1189) is present the moment `threads` exists at
    // all — the mock is bundled, not fetched — so only a ticket that is
    // genuinely absent needs a check against storage first. `ready` false
    // means that check has not happened yet: this id might be one opened in
    // this browser, still waiting on TicketsContext to read it. Same rule
    // RequireAuth follows for the session — render nothing rather than a
    // "not found" that corrects itself a tick later — rather than the
    // pricier alternative of gating every ticket, seeded ones included, on
    // a hydration nothing about them actually depends on.
    if (!ready) return null;

    return (
      <>
        <SubPageBar title="Ticket" fallback="/support/tickets" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">
            That ticket doesn't exist.
          </p>
          <Link
            href="/support/tickets"
            className="text-[15px] font-semibold text-brand"
          >
            Back to tickets
          </Link>
        </div>
      </>
    );
  }

  function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setMessages((m) => [
      ...m,
      { id: m.length + 1, from: "you", author: "You", time: "Just now", body },
    ]);
    setDraft("");
    toast("Reply sent");
  }

  return (
    <>
      <SubPageBar
        title={`${thread.subject} (#${thread.id})`}
        subtitle={thread.opened}
        fallback="/support/tickets"
        action={
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              thread.status === "Resolved"
                ? "bg-canvas text-muted"
                : "bg-brand-soft text-brand"
            }`}
          >
            {thread.status}
          </span>
        }
      />

      <PageBody
        pinnedFooter
        width="max-w-3xl"
        className="px-4 pb-4 pt-4 lg:px-8 lg:py-6"
      >
        <div className="space-y-3">
          {messages.map((m) => {
            const mine = m.from === "you";
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] lg:max-w-[70%] ${mine ? "text-right" : ""}`}
                >
                  <p className="mb-1 text-[12px] font-semibold text-muted">
                    {m.author} · {m.time}
                  </p>
                  <div
                    className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                      mine
                        ? "rounded-br-md bg-brand text-on-brand"
                        : "rounded-bl-md bg-surface text-ink shadow-card"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PageBody>

      {/*
        The composer is the bottom-most thing on this screen, so it is the one
        the floating tab bar covers — `pb-nav` is what keeps the field and the
        send button above it rather than behind it. The scroller above opts out
        of the same padding (`pinnedFooter`), because paying for the clearance
        twice put a band of empty canvas between the last message and the box
        you type in.

        Only below `lg`: on desktop the bar is a sidebar, `--spacing-nav` is
        clearance for something that is not there, and the composer closes back
        up to its own padding.
      */}
      <form
        onSubmit={send}
        className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-nav lg:px-8 lg:pb-3"
        aria-label="Reply to ticket"
      >
        <div className="mx-auto flex w-full max-w-3xl gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a reply..."
            className="flex-1 rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-brand"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send reply"
            className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </form>
    </>
  );
}
