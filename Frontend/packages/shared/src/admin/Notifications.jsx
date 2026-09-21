"use client";

import { useEffect, useState } from "react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import * as notificationsApi from "../lib/api/notifications";
import { ApiError } from "../lib/api/client";
import { tones } from "../lib/tones";
import { timeAgo } from "../lib/format";

/**
 * This admin's own notifications — over `GET /api/v1/me/notifications` and
 * friends (`packages/shared/src/lib/api/notifications.js`), the same module
 * the public sites' Notifications screen already uses. `NotificationController`
 * reads off whoever the session belongs to, so it works unchanged for the
 * signed-in admin account; nothing admin-specific was needed in the API
 * layer, only in how this screen presents it.
 *
 * This replaces what used to live at this route: a client-only "compose a
 * push broadcast" form over `state.broadcasts`. There is no backend for
 * sending a broadcast (no endpoint anywhere in `admin.web`), so that screen
 * had nothing real to be wired to — it was inventing a "Sent" history rather
 * than reading one. What the backend does expose at `/notifications` is a
 * per-principal inbox, and this account has one like any other, so that's
 * what this screen now shows. A broadcast composer can come back once
 * there's an endpoint underneath it.
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
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = () => {
    setError(null);
    setItems(null);
    notificationsApi
      .listNotifications()
      .then((page) => setItems(page.items ?? []))
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
      // the next full reload reconciles it either way.
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllNotificationsRead();
      setItems((s) => s.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch {
      // Left unread on screen; a retry is just clicking the button again.
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <>
      <AdminHeader
        title="Notifications"
        subtitle={
          items
            ? unread
              ? `${unread} unread`
              : "All caught up"
            : error
              ? undefined
              : "Loading…"
        }
        actions={
          items && unread > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={markAllRead}
              disabled={markingAll}
            >
              {markingAll ? "Marking…" : "Mark all read"}
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">
            Couldn&rsquo;t load your notifications
          </p>
          <p className="max-w-xs text-[13px] text-muted">{error}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      ) : items === null ? (
        <div role="status" aria-live="polite" aria-busy="true" className="space-y-2.5">
          <span className="sr-only">Loading notifications</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex gap-3 ${CARD}`}>
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
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => unreadItem && markRead(n.id)}
                      className={`flex items-start gap-3 rounded-2xl p-4 text-left shadow-card transition-shadow hover:shadow-lift ${
                        unreadItem ? "bg-brand-soft" : "bg-surface"
                      }`}
                    >
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[meta.tone]}`}
                      >
                        <Icon name={meta.icon} className="size-5" strokeWidth={2.5} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[14.5px] font-bold leading-tight text-ink">
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
                    </button>
                  );
                })}
            </div>
          </section>
        ))
      ) : (
        <EmptyState
          icon="Bell"
          title="No notifications"
          body="Alerts about this account land here."
        />
      )}
    </>
  );
}
