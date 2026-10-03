"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import Button from "../components/ui/Button";
import { useQueryParam, useSiteScope } from "../lib/adminScope";
import { listAdminTickets } from "../lib/api/tickets.js";

const SITES = ["MARKETPLACE", "PERSONALS"];

export default function Tickets() {
  const router = useRouter();
  const [site] = useSiteScope();
  const [status, setStatus] = useQueryParam("status", "open");
  const [rows, setRows] = useState(null);
  const [offsets, setOffsets] = useState({});
  const [error, setError] = useState(null);
  const sites = site === "all" ? SITES : [site === "personals" ? "PERSONALS" : "MARKETPLACE"];

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const pages = await Promise.all(sites.map((scope) => listAdminTickets({ site: scope, status: status === "all" ? undefined : status, limit: 50 })));
      setRows(pages.flatMap((page) => page.items));
      setOffsets(Object.fromEntries(sites.map((scope, index) => [scope, pages[index].nextOffset])));
    } catch (caught) {
      setError(caught);
    }
  }, [site, status]);

  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    try {
      const pending = sites.filter((scope) => offsets[scope] != null);
      const pages = await Promise.all(pending.map((scope) => listAdminTickets({ site: scope, status: status === "all" ? undefined : status, limit: 50, offset: offsets[scope] })));
      setRows((current) => [...current, ...pages.flatMap((page) => page.items)]);
      setOffsets((current) => ({ ...current, ...Object.fromEntries(pending.map((scope, index) => [scope, pages[index].nextOffset])) }));
    } catch (caught) {
      setError(caught);
    }
  }

  const columns = [
    { key: "subject", label: "Subject" },
    { key: "ownerName", label: "Requester" },
    { key: "site", label: "Site" },
    { key: "status", label: "Status" },
    { key: "updatedAt", label: "Updated", render: (row) => new Date(row.updatedAt).toLocaleString() },
  ];

  return (
    <>
      <AdminHeader title="Support tickets" subtitle="Tickets from member accounts" actions={<Button size="sm" variant="outline" onClick={load}>Refresh</Button>} />
      <div className="mb-4 flex gap-2">
        {["open", "resolved", "all"].map((option) => (
          <button key={option} type="button" aria-pressed={status === option} onClick={() => setStatus(option)} className={`rounded-xl px-3 py-2 text-sm font-semibold capitalize ${status === option ? "bg-brand text-on-brand" : "bg-surface text-ink"}`}>{option}</button>
        ))}
      </div>
      {error && <div role="alert" className={`${CARD} mb-4 text-danger`}>{error.message}</div>}
      {rows == null ? <p role="status" className="text-muted">Loading tickets…</p> : (
        <div className={CARD}>
          <DataTable columns={columns} rows={rows} onRowClick={(row) => router.push(`/tickets/${row.id}`)} />
          {sites.some((scope) => offsets[scope] != null) && <Button variant="soft" onClick={loadMore} className="mt-4">Load more</Button>}
        </div>
      )}
    </>
  );
}
