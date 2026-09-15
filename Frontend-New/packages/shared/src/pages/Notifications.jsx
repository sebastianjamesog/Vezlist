"use client";

import { useState } from "react";
import Link from "next/link";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import { useToast } from "../context/ToastContext";
import { notifications as seed } from "../data/mock";
import { tones } from "../lib/tones";

export default function Notifications() {
  const toast = useToast();
  const [items, setItems] = useState(seed);
  const unread = items.filter((n) => n.unread).length;

  const markRead = (id) =>
    setItems((s) => s.map((n) => (n.id === id ? { ...n, unread: false } : n)));

  const groups = [...new Set(items.map((n) => n.group))];

  return (
    <>
      <SubPageBar
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "All caught up"}
        fallback="/profile"
        action={
          unread > 0 && (
            <button
              onClick={() => {
                setItems((s) => s.map((n) => ({ ...n, unread: false })));
                toast("All notifications marked read");
              }}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[14px] font-semibold text-brand transition-colors hover:bg-brand-soft"
            >
              Mark all read
            </button>
          )
        }
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        {items.length ? (
          groups.map((group) => (
            <section key={group} className="mb-5">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                {group}
              </h2>
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {items
                  .filter((n) => n.group === group)
                  .map((n) => (
                    <Link
                      key={n.id}
                      href={n.to}
                      onClick={() => markRead(n.id)}
                      className={`flex gap-3 rounded-2xl p-4 shadow-card transition-shadow hover:shadow-lift ${
                        n.unread ? "bg-brand-soft" : "bg-surface"
                      }`}
                    >
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[n.tone]}`}
                      >
                        <Icon
                          name={n.icon}
                          className="size-5"
                          strokeWidth={2.5}
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[15px] font-bold leading-tight text-ink">
                            {n.title}
                          </span>
                          {n.unread && (
                            <span
                              className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
                              aria-label="Unread"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                          {n.body}
                        </span>
                        <span className="mt-1 block text-[12px] text-muted">
                          {n.time}
                        </span>
                      </span>
                    </Link>
                  ))}
              </div>
            </section>
          ))
        ) : (
          <EmptyState
            icon="Bell"
            title="No notifications"
            body="Alerts about your ads land here."
          />
        )}
      </PageBody>
    </>
  );
}
