"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import Button from "../components/ui/Button";
import { useQueryParam, useSiteScope } from "../lib/adminScope";
import { useAdminSettings } from "../hooks/useAdminSettings.js";
import { listAdminTickets } from "../lib/api/tickets.js";

const SITES = ["MARKETPLACE", "PERSONALS"];

export default function Tickets() {
  const router = useRouter();
  const { ticketSlaHours } = useAdminSettings();
  const generation = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [site] = useSiteScope();
  const [status, setStatus] = useQueryParam("status", "open");
  const [rows, setRows] = useState(null);
  const [offsets, setOffsets] = useState({});
  const [error, setError] = useState(null);
  const sites =
    site === "all"
      ? SITES
      : [site === "personals" ? "PERSONALS" : "MARKETPLACE"];

  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoadingMore(false);
    setRows(null);
    setError(null);
    try {
      const pages = await Promise.all(
        sites.map((scope) =>
          listAdminTickets({
            site: scope,
            status: status === "all" ? undefined : status,
            limit: 50,
          }),
        ),
      );
      if (version !== generation.current) return;
      setRows(
        pages
          .flatMap((page) => page.items)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      );
      setOffsets(
        Object.fromEntries(
          sites.map((scope, index) => [scope, pages[index].nextOffset]),
        ),
      );
    } catch (caught) {
      if (version === generation.current) setError(caught);
    }
  }, [site, status]);

  useEffect(() => {
    load();
    return () => {
      generation.current++;
    };
  }, [load]);

  async function loadMore() {
    if (loadingMore) return;
    const version = generation.current;
    setLoadingMore(true);
    try {
      const pending = sites.filter((scope) => offsets[scope] != null);
      const pages = await Promise.all(
        pending.map((scope) =>
          listAdminTickets({
            site: scope,
            status: status === "all" ? undefined : status,
            limit: 50,
            offset: offsets[scope],
          }),
        ),
      );
      if (version !== generation.current) return;
      setRows((current) =>
        [
          ...new Map(
            [...current, ...pages.flatMap((page) => page.items)].map((row) => [
              row.id,
              row,
            ]),
          ).values(),
        ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      );
      setOffsets((current) => ({
        ...current,
        ...Object.fromEntries(
          pending.map((scope, index) => [scope, pages[index].nextOffset]),
        ),
      }));
    } catch (caught) {
      if (version === generation.current) setError(caught);
    } finally {
      if (version === generation.current) setLoadingMore(false);
    }
  }

  const columns = [
    { key: "subject", label: "Subject" },
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
