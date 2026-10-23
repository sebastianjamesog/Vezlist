"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useAdminSettings } from "../hooks/useAdminSettings.js";
import { useAdminQueue } from "../lib/useAdminQueue";
import { useSiteScope } from "../lib/adminScope";
import { ApiError } from "../lib/api/client.js";
import * as moderationApi from "../lib/api/adminModeration.js";

/**
 * Owner appeals of a moderation decision, over the same staff case queue
 * `Reports` reads — filtered to `kind === "APPEAL"` here instead of
 * `"REPORT"`.
 *
 * Reinstating an appealed ad (`APPROVE`) goes through the same eligibility
 * the original submission did: every ready image must be marked PASS
 * by *this* reviewer before the backend will accept the approval, so
 * the media strip below the appeal message is reviewable, not just a
 * gallery. Rejecting the appeal (`REJECT`, upholding the original decision)
 * has no such requirement.
 *
 * Like `Reports`, the queue endpoint only lists open cases — there is no
 * history of already-decided appeals to show, so there is no status tab.
 */

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
  const units = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [name, size] of units) {
    const n = Math.floor(ms / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "Just now";
};

export default function Appeals({ kind = "APPEAL" } = {}) {
  const { admin } = useAdminAuth();
  const [site] = useSiteScope();
  return (
    <AppealsQueue
      key={`${admin?.id}:${admin?.role}:${site}:${kind}`}
      kind={kind}
    />
  );
}

function AppealsQueue({ kind }) {
  const submission = kind === "SUBMISSION";
  const title = submission ? "Review queue" : "Appeals";
  const singular = submission ? "submission" : "appeal";
  const { can, admin } = useAdminAuth();
  const toast = useToast();
  const [site] = useSiteScope();
  const queueTargets = useAdminSettings();

  const { rows, error, load, hasMore, loadingMore, loadMore } = useAdminQueue(
    site,
    moderationApi.queueCases,
    kind,
  );

  const [acting, setActing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [reviews, setReviews] = useState({}); // mediaId -> "PASS" | "BLOCK"
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [eligibilityChecked, setEligibilityChecked] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [reviewingMedia, setReviewingMedia] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  const detailVersion = useRef(0);
  const operation = useRef(false);
  const [takeoverAvailable, setTakeoverAvailable] = useState(false);
  useEffect(
    () => () => {
      detailVersion.current++;
    },
    [],
  );
  useEffect(() => {
    const refresh = () => {
      if (
        !acting &&
        !operation.current &&
        document.visibilityState !== "hidden"
      )
        load();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [acting, load]);

  function closeDecision() {
    if (operation.current) return;
    detailVersion.current += 1;
    setActing(null);
  }

  const sorted = useMemo(
    () =>
      [...(rows ?? [])].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      ),
    [rows],
  );

  async function openDecide(row) {
    if (operation.current) return;
    const version = ++detailVersion.current;
    setActing(row);
    setClaimed(false);
    setEligibilityChecked(false);
    setDecisionError(null);
    setDetail(null);
    setDetailError(null);
    setReviews({});
    setTakeoverAvailable(false);
    setNote("");
    setRejectReason(REJECT_REASONS[0].value);
    try {
      const d = await moderationApi.caseDetail(row.id);
      if (version !== detailVersion.current) return;
      setDetail(d);
      if (d.review.status === "CLOSED") {
        setDetailError(
          "This case has already been decided. Refresh the queue to see current appeals.",
        );
        return;
      }
      if (d.listing?.owner_id === admin.id) {
        setDetailError(
          "You cannot review your own ad. Another reviewer must decide this appeal.",
        );
        return;
      }
      setReviews(
        Object.fromEntries(
          (d.mediaReviews ?? [])
            .filter(
              (r) =>
                r.reviewer_id === admin.id &&
                d.media.some(
                  (m) =>
                    m.id === r.media_id &&
                    m.checksum_sha256 === r.checksum_sha256,
                ),
            )
            .map((r) => [r.media_id, r.verdict]),
        ),
      );
      if (
        d.actions?.some(
          (a) => a.action === "APPROVE" && a.actor_id === admin.id,
        )
      ) {
        setDetailError(
          "Your approval is recorded. A different reviewer must complete this appeal.",
        );
        return;
      }
      if (!d.review.assignee) {
        await moderationApi.assignCase(row.id, admin.id);
      } else if (d.review.assignee !== admin.id) {
        setTakeoverAvailable(admin.role === "owner");
        setDetailError("This case is already assigned to another reviewer.");
        return;
      }
      if (version === detailVersion.current) setClaimed(true);
    } catch (err) {
      if (version === detailVersion.current)
        setDetailError(
          err instanceof ApiError ? err.message : "Couldn't load this appeal.",
        );
    }
  }

  async function takeOver() {
    if (!acting || !takeoverAvailable || operation.current) return;
    const version = detailVersion.current;
    const row = acting;
    operation.current = true;
    setSubmitting(true);
    try {
      await moderationApi.assignCase(row.id, admin.id);
      if (version !== detailVersion.current) return;
      operation.current = false;
      setSubmitting(false);
      await openDecide(row);
    } catch (err) {
      if (version === detailVersion.current)
        setDetailError(
          err instanceof ApiError
            ? err.message
            : "Couldn't take over this case.",
        );
    } finally {
      operation.current = false;
      if (version === detailVersion.current) setSubmitting(false);
    }
  }

  const appealMessage = detail?.actions?.find(
    (a) => a.action === "APPEAL",
  )?.private_note;
  const readyMedia = (detail?.media ?? []).filter((m) => m.status === "READY");
  const allReviewed =
    readyMedia.length > 0 &&
    readyMedia.length === detail?.media?.length &&
    readyMedia.every((m) => reviews[m.id] === "PASS");
  const eligibilityRequired = Boolean(detail?.policy?.eligibilityRequired);
  const otherReviewerBlock = (detail?.mediaReviews ?? []).some(
    (r) =>
      r.reviewer_id !== admin.id &&
      r.verdict === "BLOCK" &&
      readyMedia.some(
        (m) => m.id === r.media_id && m.checksum_sha256 === r.checksum_sha256,
      ),
  );

  async function reviewMedia(mediaId, verdict) {
    if (!claimed || operation.current) return;
    operation.current = true;
    const version = detailVersion.current;
    setReviewingMedia(true);
    try {
      await moderationApi.reviewCaseMedia(acting.id, { mediaId, verdict });
      if (version !== detailVersion.current) return;
      setReviews((r) => ({ ...r, [mediaId]: verdict }));
    } catch (err) {
      if (version === detailVersion.current)
        toast(
          err instanceof ApiError ? err.message : "Couldn't record that review",
        );
    } finally {
      operation.current = false;
      if (version === detailVersion.current) setReviewingMedia(false);
    }
  }

  async function decide(decision) {
    if (!acting || !claimed || operation.current) return;
    operation.current = true;
    const version = detailVersion.current;
    setDecisionError(null);
    setSubmitting(true);
    try {
      const result = await moderationApi.decideCase(acting.id, {
        decision,
        reason: decision === "REJECT" ? rejectReason : undefined,
        note: note.trim() || undefined,
        eligibilityChecked: decision === "APPROVE" && eligibilityChecked,
      });
      if (version !== detailVersion.current) return;
      load();
      if (result.caseStatus === "CLOSED") {
        const published = result.listingStatus === "ACTIVE";
        const rejected = ["REJECTED", "REMOVED"].includes(result.listingStatus);
        toast(
          !published && !rejected
            ? "This case is closed. The ad has not been reinstated."
            : submission
            ? published
              ? "Submission approved - ad published"
              : "Submission rejected"
            : published
              ? "Appeal overturned - ad reinstated"
              : "Appeal rejected - decision stands",
        );
      } else {
        toast(
          "Approval recorded. A different reviewer must give the remaining approval.",
        );
      }
      setActing(null);
    } catch (err) {
      if (version === detailVersion.current)
        setDecisionError(
          err instanceof ApiError
            ? err.message
            : "Couldn't record that decision.",
        );
    } finally {
      operation.current = false;
      if (version === detailVersion.current) setSubmitting(false);
    }
  }

  const columns = [
    {
      key: "title",
      label: submission ? "Submitted ad" : "Appealed ad",
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
      render: (row) => (
        <StatusBadge status={row.listing_status?.toLowerCase()} />
      ),
    },
    {
      key: "created_at",
      label: "Raised",
      width: 120,
      render: (row) => (
        <span className="text-muted">
          {timeAgo(row.created_at)}
          {Date.now() - new Date(row.created_at).getTime() >
            queueTargets.reviewSlaHours * 3_600_000 && (
            <span className="block text-[12px] font-semibold text-danger">
              Overdue
            </span>
          )}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      width: 110,
      sortable: false,
      render: (row) =>
        can(submission ? "listing.moderate" : "appeal.decide") ? (
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
        <AdminHeader title={title} />
        <EmptyState
          icon="ShieldAlert"
          title={`Couldn't load ${submission ? "review queue" : "appeals"}`}
          body={
            error instanceof ApiError ? error.message : "Something went wrong."
          }
          action={<Button onClick={load}>Try again</Button>}
        />
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title={title}
        actions={
          <Button variant="outline" onClick={load} disabled={rows === null}>
            Refresh
          </Button>
        }
        subtitle={
          rows
            ? `${sorted.length} open ${singular}${sorted.length === 1 ? "" : "s"}${hasMore ? " loaded" : ""}`
            : "Loading…"
        }
      />

      {rows === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-card bg-canvas shadow-card"
            />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          empty={{
            icon: "ClipboardCheck",
            title: submission ? "No submissions" : "No appeals",
            body: hasMore
              ? "No matching requests in the loaded pages. Load more to continue checking."
              : "Nothing to reconsider right now.",
          }}
        />
      )}

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}

      <Modal
        open={Boolean(acting)}
        title={acting?.title ?? (submission ? "Submission" : "Appeal")}
        subtitle={acting ? `Raised ${timeAgo(acting.created_at)}` : undefined}
        size="max-w-lg"
        onClose={closeDecision}
        footer={
          detail && !detailError && claimed ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={submitting || reviewingMedia}
                onClick={() => decide("REJECT")}
              >
                {submission ? "Reject" : "Uphold"}
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={
                  submitting ||
                  reviewingMedia ||
                  !allReviewed ||
                  otherReviewerBlock ||
                  (eligibilityRequired && !eligibilityChecked)
                }
                onClick={() => decide("APPROVE")}
              >
                {submission ? "Approve" : "Overturn"}
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
        {takeoverAvailable && (
          <Button variant="outline" disabled={submitting} onClick={takeOver}>
            Take over review
          </Button>
        )}
        {(detailError || decisionError) && !takeoverAvailable && (
          <Button variant="outline" onClick={() => openDecide(acting)}>
            Reload case
          </Button>
        )}
        {decisionError && (
          <p role="alert" className="mb-3 text-[13.5px] text-danger">
            {decisionError}
          </p>
        )}
        {!detail && !detailError && (
          <p className="text-[14px] text-muted">Loading…</p>
        )}
        {detail && (
          <div className="flex flex-col gap-4">
            {!submission && detail.listing?.publicReason && (
              <div className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm">
                <h3 className="font-bold">Original moderation reason</h3>
                <p>{detail.listing.publicReason}</p>
              </div>
            )}
            {!submission && (
              <h3 className="text-sm font-bold">Advertiser’s appeal</h3>
            )}
            <div className="rounded-xl bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink">
              {submission
                ? detail.listing?.description || "No description on file."
                : appealMessage || "No written statement on file."}
            </div>

            {readyMedia.length === 0 && (
              <p className="text-sm text-muted">
                No ready photos are available. The ad cannot be reinstated until
                its photos finish processing.
              </p>
            )}

            {readyMedia.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-muted">
                  Photos — review before overturning
                </h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {readyMedia.map((m) => (
                    <div key={m.id} className="flex flex-col gap-1.5">
                      <div className="relative aspect-square overflow-hidden rounded-xl">
                        <MediaImage
                          fill
                          src={m.url}
                          alt=""
                          sizes="120px"
                          className="object-cover"
                        />
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={!claimed || reviewingMedia || submitting}
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
                          disabled={!claimed || reviewingMedia || submitting}
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
                    Every photo must be ready and marked Pass before approval is
                    available.
                  </p>
                )}
              </div>
            )}

            {otherReviewerBlock && (
              <p className="text-[13px] text-danger">
                Another reviewer has blocked a photo. Approval is unavailable
                until that review is resolved.
              </p>
            )}
            {eligibilityRequired && (
              <label className="flex items-start gap-2 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={eligibilityChecked}
                  onChange={(e) => setEligibilityChecked(e.target.checked)}
                  disabled={!claimed || submitting}
                  className="mt-1"
                />
                I have checked the advertiser's eligibility and consent.
              </label>
            )}
            {(detail.policy?.approvalsRequired ?? 1) > 1 && (
              <p className="text-[13px] text-muted">
                This {singular} requires {detail.policy.approvalsRequired}{" "}
                different reviewers to approve it before the ad is reinstated.
              </p>
            )}
            <Field
              label={submission ? "Rejection reason" : "Reason to uphold"}
              hint={
                submission
                  ? "Used only if you reject this submission"
                  : "Used only if you uphold the original decision"
              }
            >
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

            <Field
              label="Note"
              hint="Optional — internal, goes on the audit entry"
            >
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
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
