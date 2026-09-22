"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import Icon from "../components/ui/Icon";
import { useAdminData } from "../context/AdminDataContext";
import { inScope, useQueryParam, useSiteScope } from "../lib/adminScope";
import { timeAgo } from "../lib/format";

/**
 * The support queue. Sorted oldest-first by default, because the ticket that
 * has been waiting longest is the one about to become a complaint.
 */

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "resolved", label: "Resolved" },
];

export default function Tickets() {
  const { state } = useAdminData();
  const router = useRouter();
  const [status, setStatus] = useQueryParam("status", "open");
  // Scoped like every other list, so the rail badge and this table agree.
  const [site] = useSiteScope();

  const slaMs = (state.settings.ticketSlaHours ?? 24) * 3_600_000;
  const assigneeName = (row) =>
    state.admins.find((a) => a.id === row.assigneeId)?.name ?? null;
  // Waiting on us, and waiting too long. A ticket an agent has already
  // answered is waiting on the requester and is not late.
  const isOverdue = (row) =>
    row.status === "open" &&
    row.messages.at(-1)?.from !== "agent" &&
    row.openedMsAgo > slaMs;

  const rows = useMemo(
    () =>
      state.tickets.filter(
        (t) => inScope(t, site) && (status === "all" || t.status === status),
      ),
    [state.tickets, site, status],
  );

  const columns = [
    {
      key: "subject",
      label: "Subject",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
            <Icon name={row.icon} className="size-[18px]" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-ink">{row.subject}</p>
            <p className="truncate text-[12.5px] text-muted">#{row.id}</p>
          </div>
        </div>
      ),
    },
    { key: "requester", label: "Raised by", width: 160 },
    {
      key: "assigneeId",
      label: "Assigned",
      width: 150,
      value: (row) => assigneeName(row) ?? "zzz",
      render: (row) => {
        const name = assigneeName(row);
        return name ? (
          <span className="text-ink">{name}</span>
        ) : (
          <span className="text-muted">Unassigned</span>
        );
      },
    },
    {
      key: "messages",
      label: "Replies",
      width: 100,
      value: (row) => row.messages.length,
      render: (row) => row.messages.length,
    },
    {
      key: "openedMsAgo",
      label: "Age",
      width: 130,
      render: (row) => (
        <span className="text-muted">{timeAgo(row.openedMsAgo)}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={row.status} />
          {isOverdue(row) && <StatusBadge status="rejected" label="Overdue" />}
        </div>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        title="Tickets"
        subtitle={`${rows.length} ticket${rows.length === 1 ? "" : "s"} in this view`}
      />

      <div
        role="group"
        aria-label="Ticket status"
        className="mb-4 flex w-fit gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line"
      >
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={status === s.value}
            onClick={() => setStatus(s.value)}
            className={`rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              status === s.value
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={(row) => router.push(`/tickets/${row.id}`)}
        initialSort={{ key: "openedMsAgo", dir: "desc" }}
        empty={{
          icon: "LifeBuoy",
          title: "Queue is clear",
          body: "No tickets in this status.",
        }}
      />
    </>
  );
}
