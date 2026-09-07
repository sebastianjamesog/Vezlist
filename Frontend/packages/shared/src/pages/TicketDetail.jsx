"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { useToast } from "../context/ToastContext";
import { ticketThreads } from "../data/mock";

export default function TicketDetail() {
  const { id } = useParams();
  const toast = useToast();
  const thread = ticketThreads[id];
  const [messages, setMessages] = useState(thread?.messages ?? []);
  const [draft, setDraft] = useState("");

  if (!thread) {
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

      <PageBody width="max-w-3xl" className="px-4 pb-4 pt-4 lg:px-8 lg:py-6">
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

      <form
        onSubmit={send}
        className="border-t border-line bg-surface px-4 py-3 lg:px-8"
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
