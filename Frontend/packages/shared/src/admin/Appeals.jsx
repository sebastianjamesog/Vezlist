"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import MediaImage from "../components/media/MediaImage.jsx";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { useSiteScope } from "../lib/adminScope";
import { ApiError } from "../lib/api/client.js";
import * as moderationApi from "../lib/api/adminModeration.js";

/**
 * Owner appeals of a moderation decision, over the same staff case queue
 * `Reports` reads — filtered to `kind === "APPEAL"` here instead of
 * `"REPORT"`.
 *
 * Reinstating an appealed ad (`APPROVE`) goes through the same eligibility
 * the original submission did: every ready image must be reviewed (pass or
 * block) by *this* reviewer before the backend will accept the approval, so
 * the media strip below the appeal message is reviewable, not just a
 * gallery. Rejecting the appeal (`REJECT`, upholding the original decision)
 * has no such requirement.
 *
 * Like `Reports`, the queue endpoint only lists open cases — there is no
 * history of already-decided appeals to show, so there is no status tab.
 */

const SITES = ["MARKETPLACE", "PERSONALS"];

const REJECT_REASONS = [
  { value: "PROHIBITED_CONTENT", label: "Prohibited content" },
  { value: "UNSAFE_CONTENT", label: "Unsafe content" },
  { value: "MISLEADING_CONTENT", label: "Misleading content" },
  { value: "DUPLICATE_OR_SPAM", label: "Duplicate or spam" },
  { value: "MEDIA_REQUIRES_CHANGES", label: "Media requires changes" },
  { value: "ELIGIBILITY_NOT_CONFIRMED", label: "Eligibility not confirmed" },
];

const timeAgo = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const units = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
  for (const [name, size] of units) {
    const n = Math.floor(ms / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "Just now";
};

export default function Appeals() {
  const { can, admin } = useAdminAuth();
  const toast = useToast();
  const [site] = useSiteScope();

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const [acting, setActing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [reviews, setReviews] = useState({}); // mediaId -> "PASS" | "BLOCK"
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0].value);
  const [submitting, setSubmitting] = useState(false);

  const sitesToQuery = site === "all" ? SITES : [site === "personals" ? "PERSONALS" : "MARKETPLACE"];

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const pages = await Promise.all(
        sitesToQuery.map((s) => moderationApi.queueCases({ site: s, limit: 50, offset: 0 })),
      );
      setRows(pages.flat().filter((c) => c.kind === "APPEAL"));
    } catch (err) {
      setError(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [rows],
  );

  async function openDecide(row) {
    setActing(row);
    setDetail(null);
    setDetailError(null);
    setReviews({});
    setNote("");
    setRejectReason(REJECT_REASONS[0].value);
    try {
      const d = await moderationApi.caseDetail(row.id);
      setDetail(d);
      if (!d.review.assignee) {
        await moderationApi.assignCase(row.id, admin.id);
      } else if (d.review.assignee !== admin.id) {
        setDetailError("This case is already assigned to another reviewer.");
      }
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : "Couldn't load this appeal.");
    }
  }

  const appealMessage = detail?.actions?.find((a) => a.action === "APPEAL")?.private_note;
  const readyMedia = (detail?.media ?? []).filter((m) => m.status === "READY");
  const allReviewed = readyMedia.length > 0 && readyMedia.every((m) => reviews[m.id]);

  async function reviewMedia(mediaId, verdict) {
    try {
      await moderationApi.reviewCaseMedia(acting.id, { mediaId, verdict });
      setReviews((r) => ({ ...r, [mediaId]: verdict }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't record that review");
    }
  }

  async function decide(decision) {
    if (!acting) return;
    setSubmitting(true);
    try {
      await moderationApi.decideCase(acting.id, {
        decision,
        reason: decision === "REJECT" ? rejectReason : undefined,
        note: note.trim() || undefined,
      });
      setRows((prev) => (prev ?? []).filter((r) => r.id !== acting.id));
      toast(decision === "APPROVE" ? "Appeal overturned — ad reinstated" : "Appeal rejected — decision stands");
      setActing(null);
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : "Couldn't record that decision.");
    } finally {
      setSubmitting(false);
    }
  }

  const columns = [
    {
      key: "title",
      label: "Appealed ad",
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
      label: "Raised",
      width: 120,
      render: (row) => <span className="text-muted">{timeAgo(row.created_at)}</span>,
    },
    {
      key: "actions",
      label: "",
      width: 110,
      sortable: false,
      render: (row) =>
        can("appeal.decide") ? (
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
        <AdminHeader title="Appeals" />
        <EmptyState
          icon="ShieldAlert"
          title="Couldn't load appeals"
          body={error instanceof ApiError ? error.message : "Something went wrong."}
          action={<Button onClick={load}>Try again</Button>}
        />
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title="Appeals"
        subtitle={rows ? `${sorted.length} open appeal${sorted.length === 1 ? "" : "s"}` : "Loading…"}
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
            icon: "ClipboardCheck",
            title: "No appeals",
            body: "Nothing to reconsider right now.",
          }}
        />
      )}

      <Modal
        open={Boolean(acting)}
        title={acting?.title ?? "Appeal"}
        subtitle={acting ? `Raised ${timeAgo(acting.created_at)}` : undefined}
        size="max-w-lg"
        onClose={() => setActing(null)}
        footer={
          detail && !detailError ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={submitting}
                onClick={() => decide("REJECT")}
              >
                Uphold
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={submitting || !allReviewed}
                onClick={() => decide("APPROVE")}
              >
                Overturn
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
        {!detail && !detailError && <p className="text-[14px] text-muted">Loading…</p>}
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink">
              {appealMessage || "No written statement on file."}
            </div>

            {readyMedia.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-muted">
                  Photos — review before overturning
                </h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {readyMedia.map((m) => (
                    <div key={m.id} className="flex flex-col gap-1.5">
                      <div className="relative aspect-square overflow-hidden rounded-xl">
                        <MediaImage fill src={m.url} alt="" sizes="120px" className="object-cover" />
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => reviewMedia(m.id, "PASS")}
                          className={`flex-1 rounded-lg py-1 text-[11px] font-bold ${
                            reviews[m.id] === "PASS"
                              ? "bg-emerald-600 text-white"
                              : "bg-canvas text-muted hover:bg-line"
                          }`}
                        >
                          Pass
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewMedia(m.id, "BLOCK")}
                          className={`flex-1 rounded-lg py-1 text-[11px] font-bold ${
                            reviews[m.id] === "BLOCK"
                              ? "bg-red-600 text-white"
                              : "bg-canvas text-muted hover:bg-line"
                          }`}
                        >
                          Block
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!allReviewed && (
                  <p className="mt-1.5 text-[12.5px] text-muted">
                    Review every photo before overturning is available.
                  </p>
                )}
              </div>
            )}

            <Field label="Reason to uphold" hint="Used only if you uphold the original decision">
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className={`${FIELD} ${border(false)}`}
              >
                {REJECT_REASONS.map((r) => (
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
                placeholder="Photo re-checked, it is clean now."
                className={`${FIELD} ${border(false)} resize-none`}
              />
            </Field>
            <p className="text-[13px] leading-relaxed text-muted">
              Uphold says the original decision stands. Overturn reinstates the
              ad — it requires every photo above to be reviewed first.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
