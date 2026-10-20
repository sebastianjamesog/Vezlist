"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { useAdminSettings } from "../hooks/useAdminSettings.js";
import { useAdminQueue } from "../lib/useAdminQueue";
import { useSiteScope } from "../lib/adminScope";
import { ApiError } from "../lib/api/client.js";
import * as moderationApi from "../lib/api/adminModeration.js";

/**
 * Member reports, over the staff moderation case queue
 * (`GET /api/v1/moderation/cases`, `.../decisions`). The queue is one list of
 * cases shared with `Appeals` and with a plain pending-review submission —
 * this screen is that list filtered to `kind === "REPORT"`.
 *
 * The queue endpoint only ever returns *open* cases (the backend's `queue()`
 * is `WHERE status = 'OPEN'`) — there is no history endpoint for resolved or
 * dismissed reports, so unlike the old mock there is no status tab here.
 * Deciding a report closes its case and it simply leaves this list.
 */

const REASON_LABELS = {
  SPAM: "Spam",
  FRAUD: "Fraud",
  PROHIBITED: "Prohibited content",
  SAFETY: "Safety",
  OTHER: "Other",
};

const REMOVE_REASONS = [
  { value: "PROHIBITED_CONTENT", label: "Prohibited content" },
  { value: "UNSAFE_CONTENT", label: "Unsafe content" },
  { value: "MISLEADING_CONTENT", label: "Misleading content" },
  { value: "DUPLICATE_OR_SPAM", label: "Duplicate or spam" },
  { value: "MEDIA_REQUIRES_CHANGES", label: "Media requires changes" },
];

const ageMs = (iso) => Date.now() - new Date(iso).getTime();
const timeAgo = (iso) => {
  const ms = ageMs(iso);
  const units = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
  for (const [name, size] of units) {
    const n = Math.floor(ms / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "Just now";
};

export default function Reports() {
  const { can, admin } = useAdminAuth();
  const toast = useToast();
  const [site] = useSiteScope();
  const queueTargets = useAdminSettings();

  const { rows, error, load, hasMore, loadingMore, loadMore } = useAdminQueue(site, moderationApi.queueCases, "REPORT");

  const [acting, setActing] = useState(null); // queue row
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [note, setNote] = useState("");
  const [removeReason, setRemoveReason] = useState(REMOVE_REASONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  const detailVersion = useRef(0);
  function closeDecision() {
    if (submitting) return;
    detailVersion.current += 1;
    setActing(null);
  }

  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [rows],
  );

  async function openDecide(row) {
    const version = ++detailVersion.current;
    setActing(row);
    setClaimed(false);
    setDecisionError(null);
    setDetail(null);
    setDetailError(null);
    setNote("");
    setRemoveReason(REMOVE_REASONS[0].value);
    try {
      const d = await moderationApi.caseDetail(row.id);
      if (version !== detailVersion.current) return;
      setDetail(d);
      // Claim it before offering a decision — the backend refuses a decision
      // from anyone who hasn't. A case someone else already claimed shows up
      // as a 409 here instead of on the decision click.
      if (!d.review.assignee) {
        await moderationApi.assignCase(row.id, admin.id);
      } else if (d.review.assignee !== admin.id) {
        setDetailError("This case is already assigned to another reviewer.");
        return;
      }
      if (version === detailVersion.current) setClaimed(true);
    } catch (err) {
      if (version === detailVersion.current) setDetailError(err instanceof ApiError ? err.message : "Couldn't load this report.");
    }
  }

  async function decide(decision) {
    if (!acting || !claimed || submitting) return;
    setDecisionError(null);
    setSubmitting(true);
    try {
      await moderationApi.decideCase(acting.id, {
        decision,
        reason: decision === "REMOVE" ? removeReason : undefined,
        note: note.trim() || undefined,
      });
      load();
      toast(decision === "REMOVE" ? "Ad removed, report resolved" : "Report dismissed");
      setActing(null);
    } catch (err) {
      setDecisionError(err instanceof ApiError ? err.message : "Couldn't record that decision.");
    } finally {
      setSubmitting(false);
    }
  }

  const columns = [
    {
      key: "title",
      label: "Reported ad",
      render: (row) => (
        <Link
          href={`/listings/${row.listing_id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-bold text-brand hover:underline"
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: "site_scope",
      label: "Site",
      width: 120,
      render: (row) => <StatusBadge status={row.site_scope?.toLowerCase()} />,
    },
    {
      key: "listing_status",
      label: "Ad status",
      width: 130,
      render: (row) => <StatusBadge status={row.listing_status?.toLowerCase()} />,
    },
    {
      key: "created_at",
      label: "Age",
      width: 120,
      render: (row) => <span className="text-muted">{timeAgo(row.created_at)}{Date.now() - new Date(row.created_at).getTime() > queueTargets.reportSlaHours * 3_600_000 && <span className="block text-[12px] font-semibold text-danger">Overdue</span>}</span>,
    },
    {
      key: "actions",
      label: "",
      width: 110,
      sortable: false,
      render: (row) =>
        can("report.decide") ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              openDecide(row);
            }}
          >
            Decide
          </Button>
        ) : null,
    },
  ];

  if (error) {
    return (
      <>
        <AdminHeader title="Reports" />
        <EmptyState
          icon="ShieldAlert"
          title="Couldn't load reports"
          body={error instanceof ApiError ? error.message : "Something went wrong."}
          action={<Button onClick={load}>Try again</Button>}
        />
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title="Reports"
        subtitle={
          rows ? `${sorted.length} open report${sorted.length === 1 ? "" : "s"}` : "Loading…"
        }
      />

      {rows === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-canvas shadow-card" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          empty={{
            icon: "ShieldCheck",
            title: "Nothing reported",
            body: hasMore ? "No matching requests in the loaded pages. Load more to continue checking." : "No open reports on this site.",
          }}
        />
      )}

      {hasMore && <div className="mt-4 flex justify-center"><Button variant="outline" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading..." : "Load more"}</Button></div>}

      <Modal
        open={Boolean(acting)}
        title={acting?.title ?? "Report"}
        subtitle={acting ? `Reported ${timeAgo(acting.created_at)}` : undefined}
        size="max-w-md"
        onClose={closeDecision}
        footer={
          detail && !detailError && claimed ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={submitting}
                onClick={() => decide("DISMISS")}
              >
                Dismiss
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                disabled={submitting}
                onClick={() => decide("REMOVE")}
              >
                Remove ad
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailError && (
          <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-medium text-danger">
            {detailError}
          </p>
        )}
        {decisionError && <p role="alert" className="mb-3 text-[13.5px] text-danger">{decisionError}</p>}
        {!detail && !detailError && <p className="text-[14px] text-muted">Loading…</p>}
        {detail && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-muted">
                Reasons filed
              </h3>
              {detail.reports?.length ? (
                <ul className="flex flex-col gap-1.5">
                  {detail.reports.map((r) => (
                    <li key={r.id} className="rounded-xl bg-canvas px-3 py-2 text-[13.5px] text-ink">
                      <span className="font-semibold">{REASON_LABELS[r.reason] ?? r.reason}</span>
                      {r.details && <span className="text-muted"> — {r.details}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-muted">No report detail on file.</p>
              )}
            </div>

            <Field label="Reason for removal" hint="Used only if you remove the ad">
              <select
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                className={`${FIELD} ${border(false)}`}
              >
                {REMOVE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Note" hint="Optional — internal, goes on the audit entry">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Ad taken down and the seller warned."
                className={`${FIELD} ${border(false)} resize-none`}
              />
            </Field>
            <p className="text-[13px] leading-relaxed text-muted">
              Dismiss says the report was wrong and the ad stays up. Remove takes
              the ad down immediately.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
