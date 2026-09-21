"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";
import * as notificationsApi from "../lib/api/notifications";
import { ApiError } from "../lib/api/client";
import { tones } from "../lib/tones";
import { timeAgo } from "../lib/format";

/**
 * `NotificationType` (Backend/src/main/java/cc/vezlist/notifications/domain
 * /NotificationType.java) is where `title`/`message`/`href` come from — the
 * server already writes copy for every event. This is purely presentation:
 * an icon and a colour per type, since the API has no use for either.
 */
const TYPE_META = {
  LISTING_APPROVED: { icon: "BadgeCheck", tone: "green" },
  LISTING_REJECTED: { icon: "Ban", tone: "rose" },
  LISTING_REMOVED: { icon: "Ban", tone: "rose" },
  LISTING_EXPIRING: { icon: "Clock", tone: "amber" },
  LISTING_SAVED_AGGREGATE: { icon: "Heart", tone: "rose" },
  SUPPORT_REPLY: { icon: "ReceiptText", tone: "slate" },
  PAYMENT_EVENT: { icon: "Coins", tone: "amber" },
  SECURITY_EVENT: { icon: "ShieldAlert", tone: "purple" },
};

function metaFor(type) {
  return TYPE_META[type] ?? { icon: "Bell", tone: "blue" };
}

/** Today / Earlier, from the server's `createdAt` rather than a seeded label. */
function groupFor(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  const sameDay =
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate();
  return sameDay ? "Today" : "Earlier";
}

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

export default function Notifications() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = () => {
    setError(null);
    setItems(null);
    notificationsApi
      .listNotifications()
      .then((page) => setItems(page.items))
      .catch((err) => setError(messageFor(err)));
  };

  useEffect(() => {
    load();
  }, []);

  const unread = items ? items.filter((n) => !n.readAt).length : 0;
  const groups = items ? [...new Set(items.map((n) => groupFor(n.createdAt)))] : [];

  async function markRead(id) {
    setItems((s) =>
      s.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
    );
    try {
      await notificationsApi.markNotificationRead(id);
    } catch {
      // Best-effort: a failed read receipt just leaves the dot showing, and
      // the next full list load will reconcile it either way.
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllNotificationsRead();
      setItems((s) => s.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      toast("All notifications marked read");
    } catch (err) {
      toast(messageFor(err));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <>
      <SubPageBar
        title="Notifications"
        subtitle={
          items ? (unread ? `${unread} unread` : "All caught up") : undefined
        }
        fallback="/profile"
        action={
          unread > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[14px] font-semibold text-brand transition-colors hover:bg-brand-soft disabled:opacity-50"
            >
              Mark all read
            </button>
          )
        }
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        {error ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
            <p className="text-[15px] font-semibold text-ink">
              Couldn't load your notifications
            </p>
            <p className="max-w-xs text-[13px] text-muted">{error}</p>
            <Button onClick={load}>Try again</Button>
          </div>
        ) : items === null ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-2xl bg-surface p-4 shadow-card"
              >
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-[15px] w-3/4 rounded" />
                  <Skeleton className="mt-2 h-[13px] w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length ? (
          groups.map((group) => (
            <section key={group} className="mb-5">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                {group}
              </h2>
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {items
                  .filter((n) => groupFor(n.createdAt) === group)
                  .map((n) => {
                    const meta = metaFor(n.type);
                    const unreadItem = !n.readAt;
                    return (
                      <Link
                        key={n.id}
                        href={n.href || "/profile/notifications"}
                        onClick={() => unreadItem && markRead(n.id)}
                        className={`flex gap-3 rounded-2xl p-4 shadow-card transition-shadow hover:shadow-lift ${
                          unreadItem ? "bg-brand-soft" : "bg-surface"
                        }`}
                      >
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[meta.tone]}`}
                        >
                          <Icon
                            name={meta.icon}
                            className="size-5"
                            strokeWidth={2.5}
                          />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-[15px] font-bold leading-tight text-ink">
                              {n.title}
                            </span>
                            {unreadItem && (
                              <span
                                className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
                                aria-label="Unread"
                              />
                            )}
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                            {n.message}
                          </span>
                          <span className="mt-1 block text-[12px] text-muted">
                            {timeAgo(Date.now() - new Date(n.createdAt).getTime())}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
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
