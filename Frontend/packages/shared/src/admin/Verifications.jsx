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
import * as verificationApi from "../lib/api/adminVerification.js";

/**
 * Per-listing ad verification review, over
 * `cc.vezlist.verification.web.StaffVerificationController`. A separate
 * queue from `Reports`/`Appeals` — verification requests are their own
 * backend concept (their own table, their own endpoints), not a case `kind`
 * on the shared moderation queue those two screens read.
 *
 * The queue endpoint (`GET .../verification-requests`) only ever lists
 * *pending* requests to review — the backend has no history endpoint for
 * already-decided ones — so, like Reports and Appeals, there is no status
 * tab here: deciding one closes it and it leaves this list.
 */

const SITES = ["MARKETPLACE", "PERSONALS"];

const timeAgo = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const units = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
  for (const [name, size] of units) {
    const n = Math.floor(ms / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "Just now";
};

export default function Verifications() {
  const { can } = useAdminAuth();
  const toast = useToast();
  const [site] = useSiteScope();

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const [acting, setActing] = useState(null); // queue row
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const sitesToQuery = site === "all" ? SITES : [site === "personals" ? "PERSONALS" : "MARKETPLACE"];

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const pages = await Promise.all(
        sitesToQuery.map((s) => verificationApi.queueVerifications({ site: s, limit: 50, offset: 0 })),
      );
      setRows(pages.flat());
    } catch (err) {
      setError(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)),
    [rows],
  );

  async function openDecide(row) {
    setActing(row);
    setDetail(null);
    setDetailError(null);
    setReason("");
    setReasonError(null);
    try {
      const d = await verificationApi.verificationDetail(row.id);
      setDetail(d);
    } catch (err) {
      setDetailError(
        err instanceof ApiError ? err.message : "Couldn't load this verification request.",
      );
    }
  }

  async function decide(decision) {
    if (!acting) return;
    if (decision === "REJECT" && !reason.trim()) {
      setReasonError("A rejection reason is required.");
      return;
    }
    setSubmitting(true);
    setReasonError(null);
    try {
      await verificationApi.decideVerification(acting.id, {
        decision,
        reason: decision === "REJECT" ? reason.trim() : undefined,
      });
      setRows((prev) => (prev ?? []).filter((r) => r.id !== acting.id));
      toast(decision === "APPROVE" ? "Listing verified" : "Verification request rejected");
      setActing(null);
    } catch (err) {
      setDetailError(
        err instanceof ApiError ? err.message : "Couldn't record that decision.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const columns = [
    {
      key: "listingTitle",
      label: "Listing",
      render: (row) => (
        <Link
          href={`/listings/${row.listingId}`}
          onClick={(e) => e.stopPropagation()}
          className="font-bold text-brand hover:underline"
        >
          {row.listingTitle}
        </Link>
      ),
    },
    {
      key: "ownerEmail",
      label: "Owner",
      render: (row) => <span className="text-ink">{row.ownerEmail}</span>,
    },
    {
      key: "site",
      label: "Site",
      width: 120,
      render: (row) => <StatusBadge status={row.site?.toLowerCase()} />,
    },
    {
      key: "code",
      label: "Code",
      width: 110,
      render: (row) => (
        <span className="font-mono text-[15px] font-bold tabular-nums tracking-wider text-ink">
          {row.code}
        </span>
      ),
    },
    {
      key: "submittedAt",
      label: "Submitted",
      width: 130,
      render: (row) => <span className="text-muted">{timeAgo(row.submittedAt)}</span>,
    },
    {
      key: "actions",
      label: "",
      width: 110,
      sortable: false,
      render: (row) =>
        can("verification.decide") ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              openDecide(row);
            }}
          >
            Review
          </Button>
        ) : null,
    },
  ];

  if (error) {
    return (
      <>
        <AdminHeader title="Verifications" />
        <EmptyState
          icon="ShieldAlert"
          title="Couldn't load verification requests"
          body={error instanceof ApiError ? error.message : "Something went wrong."}
          action={<Button onClick={load}>Try again</Button>}
        />
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title="Verifications"
        subtitle={
          rows
            ? `${sorted.length} pending verification${sorted.length === 1 ? "" : "s"}`
            : "Loading…"
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
            icon: "BadgeCheck",
            title: "Nothing pending",
            body: "No open verification requests on this site.",
          }}
        />
      )}

      <Modal
        open={Boolean(acting)}
        title={acting?.listingTitle ?? "Verification request"}
        subtitle={acting ? `Submitted ${timeAgo(acting.submittedAt)}` : undefined}
        size="max-w-lg"
        onClose={() => setActing(null)}
        footer={
          detail && !detailError ? (
            <div className="flex gap-3">
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                disabled={submitting}
                onClick={() => decide("REJECT")}
              >
                Reject
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={submitting}
                onClick={() => decide("APPROVE")}
              >
                Approve
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
            <div>
              <h3 className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-muted">
                Owner
              </h3>
              <p className="text-[14px] text-ink">{detail.ownerEmail}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <h3 className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-muted">
                  Code
                </h3>
                <div className="grid h-full place-items-center rounded-xl bg-canvas py-6">
                  <span className="font-mono text-[32px] font-extrabold tabular-nums tracking-[0.2em] text-ink">
                    {detail.code}
                  </span>
                </div>
              </div>
              <div>
                <h3 className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-muted">
                  Photo
                </h3>
                {detail.photoUrl ? (
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-canvas">
                    <MediaImage
                      fill
                      src={detail.photoUrl}
                      alt="Verification photo"
                      sizes="240px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="grid aspect-square place-items-center rounded-xl bg-canvas text-center text-[12.5px] text-muted">
                    No photo ready yet
                  </div>
                )}
              </div>
            </div>

            <p className="text-[13px] leading-relaxed text-muted">
              Confirm the code above matches what the seller is holding in the
              photo before approving. Rejecting requires a reason the seller
              will see.
            </p>

            <Field label="Reason" hint="Required for reject" error={reasonError}>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError) setReasonError(null);
                }}
                rows={3}
                placeholder="The code in the photo doesn't match this request."
                className={`${FIELD} ${border(Boolean(reasonError))} resize-none`}
              />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
