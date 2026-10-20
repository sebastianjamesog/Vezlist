"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import SearchBar from "../components/ui/SearchBar";
import Button from "../components/ui/Button";
import {
  TableHeaderSkeleton,
  TableRowSkeleton,
} from "../components/ui/Skeleton";
import { useQueryParam } from "../lib/adminScope";
import { statementDate } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import * as adminAuditApi from "../lib/api/adminAudit.js";
import { ApiError } from "../lib/api/client";

/**
 * The full audit trail — every write the console has made, plus every
 * account-security event, newest first.
 *
 * Over `GET /api/v1/admin/audit` (`AdminAuditController`), which flattens
 * moderation decisions, other admin actions (user suspend/reinstate,
 * taxonomy CRUD, listing takedown, verification decisions), and auth
 * events (login success/failure, a blocked login on a suspended account,
 * logout, register, password change/change-failed) into one cursor-
 * paginated feed. Security rows carry the request's IP and user agent,
 * shown in the Details column, since those exist only for a real request —
 * an admin action has no browser behind it to attribute one to. The
 * dashboard's own "recent activity" panel is a glance at the same feed's
 * first few rows; this is the screen it links out to when the question is
 * "show me everything that happened" rather than "what happened lately".
 *
 * The backend paginates by opaque cursor, not by offset, so filtering can
 * only work over what has actually been fetched — there is no "load
 * everything, then filter" the way the old mock store did with its 200-entry
 * cap. Filters live in the URL as before; "Load more" fetches the next page
 * and the filters keep applying as it grows.
 *
 * Not scoped to a site — an audit entry has no `site` of its own (a taxonomy
 * edit or a user suspension belongs to neither board), so unlike Listings or
 * Users this table ignores the top bar's site switcher, same as the old mock
 * version did.
 */

const PAGE_LIMIT = 50;

const EXPORT_COLUMNS = [
  { key: "at", label: "Date", value: (r) => statementDate(r.at) },
  { key: "actor", label: "Actor" },
  { key: "action", label: "Action" },
  { key: "entity", label: "Entity" },
  { key: "entityId", label: "Entity ID" },
  { key: "note", label: "Note" },
  { key: "ipAddress", label: "IP address" },
  { key: "userAgent", label: "User agent" },
];

/**
 * AdminAuditEntryResponse -> the shape this screen's columns already read.
 *
 * `ipAddress`/`userAgent` are only ever set on the security-event rows
 * (login/logout/register/password-change) this feed now also carries —
 * ordinary admin/moderation actions have no request to attribute one to,
 * so they're `null` and the Details column below renders exactly as it
 * did before this feed included security events at all.
 */
function mapEntry(entry) {
  return {
    id: entry.id,
    at: Date.parse(entry.createdAt),
    actor: entry.actorName ?? "Unknown",
    action: entry.action,
    entity: entry.targetType,
    entityId: entry.targetId,
    note: entry.details,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
  };
}

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

export default function Audit() {
  // `null` means "the first page hasn't landed yet" — distinct from `[]`,
  // which is a real empty log.
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [actor, setActor] = useQueryParam("actor", "all");
  const [action, setAction] = useQueryParam("action", "all");
  const [entity, setEntity] = useQueryParam("entity", "all");
  // Plain `YYYY-MM-DD` strings straight out of `<input type="date">` — parsed
  // against UTC midnight so a filter typed once means the same day whatever
  // time zone the browser making the request happens to sit in.
  const [from, setFrom] = useQueryParam("from", "");
  const [to, setTo] = useQueryParam("to", "");
  const [query, setQuery] = useQueryParam("q", "");

  const load = useCallback(() => {
    setError(null);
    setEntries(null);
    setCursor(null);
    setHasMore(false);
    adminAuditApi
      .auditFeed({ limit: PAGE_LIMIT })
      .then((page) => {
        setEntries((page.items ?? []).map(mapEntry));
        setCursor(page.nextCursor ?? null);
        setHasMore(Boolean(page.hasMore));
      })
      .catch((err) => setError(messageFor(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await adminAuditApi.auditFeed({ cursor, limit: PAGE_LIMIT });
      setEntries((prev) => [
        ...(prev ?? []),
        ...(page.items ?? []).map(mapEntry),
      ]);
      setCursor(page.nextCursor ?? null);
      setHasMore(Boolean(page.hasMore));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoadingMore(false);
    }
  }

  // Options are derived from what's loaded so far, the same way a new action
  // or entity used to show up on its own against the mock's 200-entry cap.
  const actors = useMemo(
    () => [...new Set((entries ?? []).map((a) => a.actor))].sort(),
    [entries],
  );
  const actions = useMemo(
    () => [...new Set((entries ?? []).map((a) => a.action))].sort(),
    [entries],
  );
  const entities = useMemo(
    () => [...new Set((entries ?? []).map((a) => a.entity))].sort(),
    [entries],
  );

  const rows = useMemo(() => {
    if (!entries) return [];
    const needle = query.trim().toLowerCase();
    const fromMs = from ? Date.parse(`${from}T00:00:00.000Z`) : null;
    // Inclusive of the whole day picked, not just its first millisecond.
    const toMs = to ? Date.parse(`${to}T23:59:59.999Z`) : null;

    return entries.filter((entry) => {
      if (actor !== "all" && entry.actor !== actor) return false;
      if (action !== "all" && entry.action !== action) return false;
      if (entity !== "all" && entry.entity !== entity) return false;
      if (fromMs !== null && entry.at < fromMs) return false;
      if (toMs !== null && entry.at > toMs) return false;
      if (!needle) return true;
      return (
        entry.actor.toLowerCase().includes(needle) ||
        entry.action.toLowerCase().includes(needle) ||
        entry.entity.toLowerCase().includes(needle) ||
        String(entry.entityId ?? "")
          .toLowerCase()
          .includes(needle) ||
        (entry.note ?? "").toLowerCase().includes(needle) ||
        (entry.ipAddress ?? "").toLowerCase().includes(needle)
      );
    });
  }, [entries, actor, action, entity, from, to, query]);

  const columns = [
    {
      key: "at",
      label: "When",
      width: 140,
      render: (row) => (
        <span className="text-muted">{statementDate(row.at)}</span>
      ),
    },
    {
      key: "actor",
      label: "Actor",
      width: 160,
      render: (row) => <span className="font-bold text-ink">{row.actor}</span>,
    },
    {
      key: "action",
      label: "Action",
      width: 170,
    },
    {
      key: "entity",
      label: "Entity",
      width: 130,
      render: (row) => <StatusBadge status={row.entity} />,
    },
    {
      key: "entityId",
      label: "Entity ID",
      width: 140,
      render: (row) => (
        <span className="font-mono text-[12.5px] text-muted">
          {row.entityId ?? ""}
        </span>
      ),
    },
    {
      key: "note",
      label: "Details",
      render: (row) => (
        <span className="line-clamp-2 text-muted">
          {row.note}
          {/* Security-event rows (login/logout/register/password-change)
              carry an IP; the full user agent rides along as a hover
              title rather than its own column, since only these rows
              ever have one and most of the feed doesn't. */}
          {row.ipAddress && (
            <span
              className="ml-1.5 font-mono text-[12px]"
              title={row.userAgent ?? undefined}
            >
              {row.note ? "· " : ""}
              {row.ipAddress}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        title="Audit log"
        subtitle={
          entries
            ? `${rows.length} of ${entries.length} loaded${hasMore ? ", more available" : ""}`
            : undefined
        }
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv("vezlist-audit.csv", EXPORT_COLUMNS, rows)
            }
          >
            Export CSV
          </Button>
        }
      />

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">
            Couldn&rsquo;t load the audit log
          </p>
          <p className="max-w-xs text-[13px] text-muted">{error}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search actor, action, entity or details..."
              className="lg:max-w-md"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Select
                label="Actor"
                value={actor}
                onChange={setActor}
                options={actors}
              />
              <Select
                label="Action"
                value={action}
                onChange={setAction}
                options={actions}
              />
              <Select
                label="Entity"
                value={entity}
                onChange={setEntity}
                options={entities}
              />
              <DateField label="From" value={from} onChange={setFrom} />
              <DateField label="To" value={to} onChange={setTo} />
            </div>
          </div>

          {entries === null ? (
            <SkeletonTable />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                initialSort={{ key: "at", dir: "desc" }}
                empty={{
                  icon: "Clock",
                  title: entries.length
                    ? "No entries match"
                    : "No activity yet",
                  body: entries.length
                    ? "Loosen a filter, or clear the search."
                    : "Admin actions will show up here as they happen.",
                }}
              />

              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

function SkeletonTable() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <span className="sr-only">Loading the audit log</span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <TableHeaderSkeleton columns={6} />
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRowSkeleton key={i} columns={6} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One filter dropdown, options built from whatever has loaded so far. */
function Select({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-9 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink outline-none"
    >
      <option value="all">
        {label === "Entity" ? "All entities" : `All ${label.toLowerCase()}s`}
      </option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} date`}
        className="bg-transparent text-[13px] font-medium text-ink outline-none"
      />
    </label>
  );
}
