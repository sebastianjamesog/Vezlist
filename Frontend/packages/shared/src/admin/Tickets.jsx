"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import Button from "../components/ui/Button";
import { useQueryParam, useSiteScope } from "../lib/adminScope";
import { useAdminSettings } from "../hooks/useAdminSettings.js";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useTicketEvents } from "../hooks/useTicketEvents.js";
import { listAdminTickets } from "../lib/api/tickets.js";

const SITES = ["MARKETPLACE", "PERSONALS"];

export default function Tickets() {
  const router = useRouter();
  const { ticketSlaHours } = useAdminSettings();
  const { admin } = useAdminAuth();
  const accountId = admin?.id ?? null;
  const generation = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [site] = useSiteScope();
  const [status, setStatus] = useQueryParam("status", "open");
  const [data, setData] = useState({ key: null, rows: null, offsets: {} });
  const [error, setError] = useState(null);
  const queryKey = `${accountId}:${site}:${status}`;
  const activeKey = useRef(queryKey);
  activeKey.current = queryKey;
  const pagination = useRef({ key: queryKey, pages: {}, loadingMore: false });
  if (pagination.current.key !== queryKey) {
    pagination.current = { key: queryKey, pages: {}, loadingMore: false };
  }
  const rows = data.key === queryKey ? data.rows : null;
  const offsets = data.key === queryKey ? data.offsets : {};
  const sites =
    site === "all"
      ? SITES
      : [site === "personals" ? "PERSONALS" : "MARKETPLACE"];

  const load = useCallback(async () => {
    const version = ++generation.current;
    if (!accountId) return;
    setError(null);
    try {
      const pages = await Promise.all(
        sites.map(async (scope) => {
          const items = new Map();
          const count = pagination.current.pages[scope] ?? 1;
          let offset = 0;
          let nextOffset = null;
          for (let index = 0; index < count; index++) {
            const page = await listAdminTickets({
              site: scope,
              status: status === "all" ? undefined : status,
              limit: 50,
              offset,
            });
            if (
              version !== generation.current ||
              activeKey.current !== queryKey
            )
              return null;
            page.items.forEach((row) => items.set(row.id, row));
            nextOffset = page.nextOffset;
            if (nextOffset == null) break;
            offset = nextOffset;
          }
          return { scope, items: [...items.values()], nextOffset };
        }),
      );
      if (version !== generation.current || activeKey.current !== queryKey)
        return;
      setData({
        key: queryKey,
        rows: [
          ...new Map(
            pages.flatMap((page) => page.items).map((row) => [row.id, row]),
          ).values(),
        ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
        offsets: Object.fromEntries(
          pages.map((page) => [page.scope, page.nextOffset]),
        ),
      });
    } catch (caught) {
      if (version === generation.current && activeKey.current === queryKey)
        setError(caught);
    } finally {
      if (version === generation.current && activeKey.current === queryKey) {
        pagination.current.loadingMore = false;
        setLoadingMore(false);
      }
    }
  }, [queryKey, accountId, site, status]);

  useEffect(() => {
    setLoadingMore(false);
    setError(null);
    load();
    return () => {
      generation.current++;
    };
  }, [load]);

  useTicketEvents({
    staff: true,
    site: "MARKETPLACE",
    accountId: sites.includes("MARKETPLACE") ? accountId : null,
    onChange: load,
  });
  useTicketEvents({
    staff: true,
    site: "PERSONALS",
    accountId: sites.includes("PERSONALS") ? accountId : null,
    onChange: load,
  });

  async function loadMore() {
    if (!accountId || pagination.current.loadingMore) return;
    const pending = sites.filter((scope) => offsets[scope] != null);
    if (!pending.length) return;
    pagination.current.loadingMore = true;
    pending.forEach((scope) => {
      pagination.current.pages[scope] =
        (pagination.current.pages[scope] ?? 1) + 1;
    });
    setLoadingMore(true);
    await load();
  }

  const columns = [
    {
      key: "subject",
      label: "Subject",
      render: (row) => (
        <span className="flex items-center gap-2">
          {row.subject}
          {row.unreadCount > 0 && (
            <span
              aria-label={`${row.unreadCount} unread messages`}
              className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-on-brand"
            >
              {row.unreadCount > 99 ? "99+" : row.unreadCount}
            </span>
          )}
        </span>
      ),
    },
    { key: "ownerName", label: "Requester" },
    { key: "site", label: "Site" },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.status}
          {row.status === "OPEN" &&
            Date.now() - Date.parse(row.updatedAt) >
              ticketSlaHours * 3600000 && (
              <span
                className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"
                title={`No update within the ${ticketSlaHours}-hour support target`}
              >
                Overdue
              </span>
            )}
        </span>
      ),
    },
    {
      key: "updatedAt",
      label: "Updated",
      render: (row) => new Date(row.updatedAt).toLocaleString(),
    },
  ];

  return (
    <>
      <AdminHeader
        title="Support tickets"
        subtitle="Tickets from member accounts"
        actions={
          <Button size="sm" variant="outline" onClick={load}>
            Refresh
          </Button>
        }
      />
      <div className="mb-4 flex gap-2">
        {["open", "resolved", "all"].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold capitalize ${status === option ? "bg-brand text-on-brand" : "bg-surface text-ink"}`}
          >
            {option}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" className={`${CARD} mb-4 text-danger`}>
          {error.message}
        </div>
      )}
      {rows == null && !error ? (
        <p role="status" className="text-muted">
          Loading tickets…
        </p>
      ) : (
        rows != null && (
          <div className={CARD}>
            <DataTable
              columns={columns}
              rows={rows}
              onRowClick={(row) => router.push(`/tickets/${row.id}`)}
            />
            {sites.some((scope) => offsets[scope] != null) && (
              <Button
                variant="soft"
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-4"
              >
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            )}
          </div>
        )
      )}
    </>
  );
}
