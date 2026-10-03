"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Radio, RefreshCw } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { useAdminAuth } from "../context/AdminAuthContext";
import { endLiveSession, listLiveSessions } from "../lib/api/livePlans.js";

const ACTIVE = new Set(["PREPARING", "LIVE", "RECONNECTING"]);
const STATUS = {
  PREPARING: { label: "Preparing", color: "bg-blue-50 text-blue-800" },
  LIVE: { label: "Live", color: "bg-red-50 text-red-800" },
  RECONNECTING: { label: "Reconnecting", color: "bg-amber-50 text-amber-900" },
  ENDED: { label: "Ended", color: "bg-canvas text-muted" },
  FAILED: { label: "Failed", color: "bg-red-50 text-red-800" },
};

function timestamp(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Live() {
  const { ready, can } = useAdminAuth();
  const allowed = can("stream.moderate");
  const [directory, setDirectory] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState(null);
  const [notice, setNotice] = useState("");
  const requestId = useRef(0);
  const endPending = useRef(false);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const data = await listLiveSessions(50);
      if (current === requestId.current) {
        setDirectory(data);
        setError(null);
      }
    } catch (caught) {
      if (current === requestId.current)
        setError(caught.message || "Could not load live sessions.");
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !allowed) return;
    // Refresh the server-backed moderation queue when access becomes available.
    // eslint-disable-next-line react/set-state-in-effect
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      clearInterval(timer);
      requestId.current += 1;
    };
  }, [ready, allowed, refresh]);

  async function end() {
    if (!selected || endPending.current || !allowed) return;
    endPending.current = true;
    setEnding(true);
    setEndError(null);
    try {
      await endLiveSession(selected.id);
      setDirectory((current) =>
        current
          ? {
              ...current,
              items: current.items.filter(
                (session) => session.id !== selected.id,
              ),
              total: Math.max(
                0,
                current.total -
                  (current.items.some((session) => session.id === selected.id)
                    ? 1
                    : 0),
              ),
            }
          : current,
      );
      setNotice(`${selected.creatorName}'s live session has ended.`);
      setSelected(null);
      await refresh();
    } catch (caught) {
      setEndError(
        caught.message || "Could not end this session. Please try again.",
      );
    } finally {
      endPending.current = false;
      setEnding(false);
    }
  }

  if (!ready)
    return (
      <p role="status" className="text-muted">
        Loading admin access...
      </p>
    );
  if (!allowed)
    return (
      <>
        <AdminHeader title="Live sessions" />
        <p role="alert" className={CARD}>
          Only administrators and moderators can manage live sessions.
        </p>
      </>
    );
  const items = directory?.items ?? [];
  return (
    <>
      <AdminHeader
        title="Live sessions"
        subtitle={
          directory
            ? `${directory.total} active sessions`
            : "Loading Personals live sessions"
        }
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={refresh}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      <p className="mb-4 text-sm text-muted">
        Review broadcasts and end a session when moderation is needed. Demo
        purchases are marked below.
      </p>
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-900"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-900"
        >
          {error}{" "}
          <button
            type="button"
            disabled={loading}
            onClick={refresh}
            className="font-bold underline"
          >
            Try again
          </button>
        </p>
      )}
      {loading && !directory && (
        <p role="status" className="py-8 text-center text-muted">
          Loading live sessions...
        </p>
      )}
      {directory && items.length === 0 && (
        <EmptyState
          icon="Radio"
          title="No live sessions"
          body="Sessions appear here when creators prepare a broadcast."
        />
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((session) => {
          const status = STATUS[session.status] ?? {
            label: session.status,
            color: "bg-canvas text-muted",
          };
          const started = timestamp(session.startedAt);
          const ends = timestamp(session.endsAt);
          const ended = timestamp(session.endedAt);
          return (
            <article key={session.id} className={`${CARD} min-w-0`}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${status.color}`}
                >
                  <Radio className="size-3" aria-hidden="true" />
                  {status.label}
                </span>
                {session.demoPurchase && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    Demo purchase
                  </span>
                )}
              </div>
              <h2 className="mt-4 break-words text-lg font-bold text-ink">
                {session.creatorName}
              </h2>
              <p className="mt-1 break-words text-sm text-ink">
                {session.title}
              </p>
              {session.location && (
                <p className="mt-2 flex items-start gap-1.5 break-words text-xs text-muted">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">{session.location}</span>
                </p>
              )}
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Duration</dt>
                  <dd className="text-right font-medium">
                    {session.durationMinutes} minutes
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Started</dt>
                  <dd className="text-right">{started ?? "Not started"}</dd>
                </div>
                {(ended || ends) && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">
                      {ended ? "Ended" : "Scheduled end"}
                    </dt>
                    <dd className="text-right">{ended ?? ends}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-4 break-all text-xs text-muted">
                Session: {session.id}
              </p>
              {ACTIVE.has(session.status) && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="mt-4 w-full"
                  disabled={ending}
                  onClick={() => {
                    setSelected(session);
                    setEndError(null);
                  }}
                  aria-label={`End session for ${session.creatorName}`}
                >
                  End session
                </Button>
              )}
            </article>
          );
        })}
      </div>
      {directory && directory.total > items.length && (
        <p className="mt-4 text-sm text-muted">
          Showing {items.length} of {directory.total} sessions.
        </p>
      )}
      <Modal
        open={Boolean(selected)}
        title="End live session?"
        onClose={() => {
          if (!ending) setSelected(null);
        }}
        size="max-w-md"
        footer={
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={ending}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              className="flex-1"
              disabled={ending}
              onClick={end}
            >
              {ending ? "Ending..." : "End session"}
            </Button>
          </div>
        }
      >
        <p className="break-words text-sm text-ink">
          End the session hosted by <strong>{selected?.creatorName}</strong>?
          Their broadcast will stop and viewers will no longer be able to watch
          this session.
        </p>
        {endError && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {endError}
          </p>
        )}
      </Modal>
    </>
  );
}
