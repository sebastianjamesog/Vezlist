"use client";

import { useEffect } from "react";
import Link from "next/link";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import { useNotifications } from "../context/NotificationsContext";

const buttonClass =
  "rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50";

export default function Notifications() {
  const {
    items,
    nextCursor,
    loaded,
    loading,
    loadingMore,
    count,
    error,
    countError,
    mutationError,
    pending,
    sessionExpired,
    query,
  } = useNotifications();
  useEffect(() => {
    query.load();
  }, [query]);

  return (
    <>
      <SubPageBar
        title="Notifications"
        fallback="/profile"
        subtitle={
          countError || count == null
            ? "Your account updates"
            : count
              ? `${count} unread`
              : "All caught up"
        }
        action={
          count > 0 && (
            <button
              disabled={Boolean(pending)}
              onClick={() => query.markRead()}
              className={buttonClass}
            >
              {pending === "all" ? "Saving..." : "Mark all read"}
            </button>
          )
        }
      />
      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        {sessionExpired && (
          <a
            href="/login?next=%2Fprofile%2Fnotifications"
            className={buttonClass}
          >
            Sign in again to view notifications
          </a>
        )}
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Ad updates and important account alerts.
          </p>
          <button
            className={buttonClass}
            disabled={loading || Boolean(pending)}
            onClick={() => {
              query.load();
              query.count();
            }}
          >
            Refresh
          </button>
        </div>
        {(error || countError) && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-danger-soft p-4 text-sm text-danger"
          >
            {(error || countError).message}
            <button
              className={buttonClass}
              onClick={() => {
                query.load();
                query.count();
              }}
            >
              Try again
            </button>
          </div>
        )}
        {mutationError && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-danger-soft p-4 text-sm text-danger"
          >
            {mutationError.message} Your read status was not confirmed. Please
            try again.
          </p>
        )}
        {!loaded && !error && (
          <div role="status" className="grid gap-3">
            <span>Loading notifications...</span>
            {[1, 2, 3].map((id) => (
              <div
                key={id}
                className="h-28 rounded-2xl bg-surface motion-safe:animate-pulse"
              />
            ))}
          </div>
        )}
        {loaded && items.length === 0 && (
          <EmptyState
            icon="Bell"
            title="No notifications"
            body="Alerts about your ads land here."
          />
        )}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              aria-label={item.title}
              className={`flex gap-3 rounded-2xl p-4 shadow-card ${item.readAt ? "bg-surface" : "bg-brand-soft"}`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-brand">
                <Icon name="Bell" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold text-ink">{item.title}</h2>
                <p className="mt-1 text-sm text-muted">{item.message}</p>
                <time
                  dateTime={item.createdAt}
                  className="mt-1 block text-xs text-muted"
                >
                  {new Date(item.createdAt).toLocaleString()}
                </time>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link href={item.href} className={buttonClass}>
                    View details
                  </Link>
                  {item.readAt ? (
                    <span className="text-xs text-muted">Read</span>
                  ) : (
                    <>
                      <span className="text-xs font-semibold text-brand">
                        Unread
                      </span>
                      <button
                        disabled={Boolean(pending)}
                        className={buttonClass}
                        onClick={() => query.markRead(item.id)}
                      >
                        {pending === item.id ? "Saving..." : "Mark as read"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        {nextCursor && (
          <button
            disabled={loading || loadingMore || Boolean(pending)}
            className={`${buttonClass} mt-4 w-full bg-surface`}
            onClick={() => query.load(true)}
          >
            {loadingMore ? "Loading more..." : "Load more notifications"}
          </button>
        )}
      </PageBody>
    </>
  );
}
