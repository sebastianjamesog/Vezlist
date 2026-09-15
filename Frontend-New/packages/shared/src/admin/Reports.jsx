"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminData } from "../context/AdminDataContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { inScope, useQueryParam, useSiteScope } from "../lib/adminScope";
import { timeAgo } from "../lib/format";

/**
 * What members flagged, and what was done about it.
 *
 * Every row carries a link through to the thing being reported. A report you
 * cannot open is a report you have to take on trust, which is the opposite of
 * what a moderation queue is for.
 */

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

export default function Reports() {
  const { state, dispatch } = useAdminData();
  const { can } = useAdminAuth();
  const toast = useToast();
  const [site] = useSiteScope();
  const [status, setStatus] = useQueryParam("status", "open");
  const [acting, setActing] = useState(null);
  const [note, setNote] = useState("");

  // Same pattern `Tickets` and `Listings` both run: a queue row that has sat
  // open longer than the configured SLA is the one a moderator has forgotten
  // about, and the badge is what makes that visible instead of implicit in
  // the age column.
  const slaMs = (state.settings.reportSlaHours ?? 48) * 3_600_000;
  const isOverdue = (row) => row.status === "open" && row.createdMsAgo > slaMs;

  const rows = useMemo(
    () =>
      state.reports.filter(
        (r) => inScope(r, site) && (status === "all" || r.status === status),
      ),
    [state.reports, site, status],
  );

  /** Where a report points. Each target type lives on a different screen. */
  function targetLink(report) {
    if (report.targetType === "listing") {
      const row = state.listings.find((l) => l.id === report.targetId);
      return row
        ? { href: `/listings/${row.id}`, label: row.title }
        : { href: null, label: "Deleted ad" };
    }
    if (report.targetType === "user") {
      const row = state.users.find((u) => u.id === report.targetId);
      return row
        ? { href: `/users/${row.id}`, label: row.name }
        : { href: null, label: "Deleted account" };
    }
    const row = state.streams.find((s) => s.id === report.targetId);
    return row
      ? { href: "/live", label: `${row.host} — ${row.title}` }
      : { href: null, label: "Ended broadcast" };
  }

  function close(kind) {
    dispatch({
      type: kind === "resolve" ? "resolveReport" : "dismissReport",
      id: acting.id,
      note,
    });
    toast(kind === "resolve" ? "Report resolved" : "Report dismissed");
    setActing(null);
    setNote("");
  }

  const columns = [
    {
      key: "reason",
      label: "Reason",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{row.reason}</p>
          <p className="truncate text-[12.5px] text-muted">{row.detail}</p>
        </div>
      ),
    },
    {
      key: "targetType",
      label: "Target",
      width: 220,
      render: (row) => {
        const target = targetLink(row);
        return (
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
              {row.targetType}
            </p>
            {target.href ? (
              <Link
                href={target.href}
                onClick={(e) => e.stopPropagation()}
                className="block truncate font-semibold text-brand hover:underline"
              >
                {target.label}
              </Link>
            ) : (
              <span className="block truncate text-muted">{target.label}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "site",
      label: "Site",
      width: 120,
      render: (row) => <StatusBadge status={row.site} />,
    },
    { key: "reporter", label: "Reported by", width: 150 },
    {
      key: "createdMsAgo",
      label: "Age",
      width: 120,
      render: (row) => (
        <span className="text-muted">{timeAgo(row.createdMsAgo)}</span>
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
    {
      key: "actions",
      label: "",
      width: 110,
      sortable: false,
      render: (row) =>
        can("report.decide") && row.status === "open" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setActing(row);
            }}
          >
            Decide
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <AdminHeader
        title="Reports"
        subtitle={`${rows.length} report${rows.length === 1 ? "" : "s"} in this view`}
      />

      <div
        role="group"
        aria-label="Status"
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
        initialSort={{ key: "createdMsAgo", dir: "asc" }}
        empty={{
          icon: "ShieldCheck",
          title: "Nothing reported",
          body: "No reports match this filter.",
        }}
      />

      <Modal
        open={Boolean(acting)}
        title={acting?.reason ?? "Report"}
        subtitle={acting?.detail}
        size="max-w-md"
        onClose={() => setActing(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => close("dismiss")}
            >
              Dismiss
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => close("resolve")}
            >
              Resolve
            </Button>
          </div>
        }
      >
        <Field label="Note" hint="Optional — goes on the audit entry">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Ad taken down and the seller warned."
            className={`${FIELD} ${border(false)} resize-none`}
          />
        </Field>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Dismiss says the report was wrong. Resolve says it was right and
          something was done — do that something first.
        </p>
      </Modal>
    </>
  );
}
