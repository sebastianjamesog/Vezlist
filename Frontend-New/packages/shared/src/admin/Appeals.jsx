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
 * Reconsideration for a rejected listing or a suspended account.
 *
 * Honesty, stated once here rather than folded into a tooltip: nothing on
 * this screen arrives on its own. The public sites have no path to this
 * console yet — the same limit `Reports` and `Settings` both name (#10) — so
 * every row is something a moderator typed in, from an email, a phone call or
 * a support ticket, on the member's behalf. "Log appeal" below is that
 * action; it is not a form the member filled in themselves, and the queue
 * must not be read as if it were.
 */

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "all", label: "All" },
  { value: "upheld", label: "Upheld" },
  { value: "overturned", label: "Overturned" },
];

const EMPTY_DRAFT = {
  targetType: "listing",
  targetId: "",
  appellant: "",
  message: "",
};

export default function Appeals() {
  const { state, dispatch } = useAdminData();
  const { can } = useAdminAuth();
  const toast = useToast();
  const [site] = useSiteScope();
  const [status, setStatus] = useQueryParam("status", "pending");
  const [acting, setActing] = useState(null);
  const [note, setNote] = useState("");
  const [raising, setRaising] = useState(null);

  const rows = useMemo(
    () =>
      state.appeals.filter(
        (a) => inScope(a, site) && (status === "all" || a.status === status),
      ),
    [state.appeals, site, status],
  );

  /** Where an appeal points. Same shape `Reports`' `targetLink` uses. */
  function targetLink(appeal) {
    if (appeal.targetType === "listing") {
      const row = state.listings.find((l) => l.id === appeal.targetId);
      return row
        ? { href: `/listings/${row.id}`, label: row.title }
        : { href: null, label: appeal.targetLabel };
    }
    const row = state.users.find((u) => u.id === appeal.targetId);
    return row
      ? { href: `/users/${row.id}`, label: row.name }
      : { href: null, label: appeal.targetLabel };
  }

  function decide(kind) {
    dispatch({
      type: kind === "overturn" ? "overturnAppeal" : "upholdAppeal",
      id: acting.id,
      note,
    });
    toast(
      kind === "overturn"
        ? "Appeal overturned — decision reversed"
        : "Appeal upheld — decision stands",
    );
    setActing(null);
    setNote("");
  }

  // What still has something to appeal — a rejected listing, a suspended
  // account — and is not already carrying a pending appeal, the same rule
  // the reducer itself enforces on `raiseAppeal`.
  const alreadyPending = new Set(
    state.appeals
      .filter((a) => a.status === "pending")
      .map((a) => `${a.targetType}:${a.targetId}`),
  );
  const eligibleListings = state.listings.filter(
    (l) => l.status === "rejected" && !alreadyPending.has(`listing:${l.id}`),
  );
  const eligibleUsers = state.users.filter(
    (u) => u.status === "suspended" && !alreadyPending.has(`user:${u.id}`),
  );
  const eligible =
    raising?.targetType === "user" ? eligibleUsers : eligibleListings;

  function submitAppeal() {
    dispatch({
      type: "raiseAppeal",
      targetType: raising.targetType,
      targetId: raising.targetId,
      appellant: raising.appellant,
      message: raising.message,
    });
    toast("Appeal logged");
    setRaising(null);
  }

  const columns = [
    {
      key: "targetLabel",
      label: "Appeal",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{row.targetLabel}</p>
          <p className="truncate text-[12.5px] text-muted">
            {row.message || "No written statement on file."}
          </p>
        </div>
      ),
    },
    {
      key: "targetType",
      label: "Target",
      width: 190,
      render: (row) => {
        const target = targetLink(row);
        return (
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
              {row.targetType === "listing" ? "Listing" : "Account"}
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
      width: 110,
      render: (row) => <StatusBadge status={row.site} />,
    },
    { key: "appellant", label: "Appellant", width: 150 },
    {
      key: "raisedMsAgo",
      label: "Raised",
      width: 110,
      render: (row) => (
        <span className="text-muted">{timeAgo(row.raisedMsAgo)}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      label: "",
      width: 100,
      sortable: false,
      render: (row) =>
        can("appeal.decide") && row.status === "pending" ? (
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
        title="Appeals"
        subtitle={`${rows.length} appeal${rows.length === 1 ? "" : "s"} in this view`}
        actions={
          can("appeal.raise") ? (
            <Button size="sm" onClick={() => setRaising({ ...EMPTY_DRAFT })}>
              Log appeal
            </Button>
          ) : null
        }
      />

      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        Nothing here arrives on its own — the public sites have no channel to
        this console yet. Every row is logged by a moderator on the member's
        behalf, from an email, a call, or a support ticket, never submitted by
        the member directly.
      </p>

      <div
        role="group"
        aria-label="Appeal status"
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
        initialSort={{ key: "raisedMsAgo", dir: "desc" }}
        empty={{
          icon: "ClipboardCheck",
          title: "No appeals",
          body: "Nothing to reconsider in this view.",
        }}
      />

      <Modal
        open={Boolean(acting)}
        title={acting?.targetLabel ?? "Appeal"}
        subtitle={acting?.message || "No written statement on file."}
        size="max-w-md"
        onClose={() => setActing(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => decide("uphold")}
            >
              Uphold
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => decide("overturn")}
            >
              Overturn
            </Button>
          </div>
        }
      >
        {acting?.originalNote && (
          <p className="mb-3 rounded-xl bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink">
            Original decision: {acting.originalNote}
          </p>
        )}
        <Field label="Note" hint="Optional — goes on the audit entry">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Photo re-checked, it is clean now."
            className={`${FIELD} ${border(false)} resize-none`}
          />
        </Field>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Uphold says the original decision stands. Overturn reverses it — the
          listing goes back to active, or the account is restored. Either way
          the appeal closes; a listing overturn also writes to the ad's own
          decision history.
        </p>
      </Modal>

      <Modal
        open={Boolean(raising)}
        title="Log an appeal"
        subtitle="For a member who asked to be reconsidered outside the console — by email, phone, or a support ticket."
        size="max-w-md"
        onClose={() => setRaising(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setRaising(null)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!raising?.targetId || !raising?.appellant.trim()}
              onClick={submitAppeal}
            >
              Log appeal
            </Button>
          </div>
        }
      >
        {raising && (
          <div className="flex flex-col gap-4">
            <fieldset>
              <legend className="mb-1.5 text-[14px] font-bold text-ink">
                Against
              </legend>
              <div className="flex w-fit gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
                {[
                  { value: "listing", label: "A rejected listing" },
                  { value: "user", label: "A suspended account" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={raising.targetType === opt.value}
                    onClick={() =>
                      setRaising({
                        ...raising,
                        targetType: opt.value,
                        targetId: "",
                      })
                    }
                    className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      raising.targetType === opt.value
                        ? "bg-surface text-ink shadow-card"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <Field
              label={raising.targetType === "listing" ? "Listing" : "Account"}
            >
              {eligible.length ? (
                <select
                  value={raising.targetId}
                  onChange={(e) =>
                    setRaising({ ...raising, targetId: e.target.value })
                  }
                  className={`${FIELD} ${border(false)}`}
                >
                  <option value="" disabled>
                    Choose one
                  </option>
                  {eligible.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title ?? row.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[13px] text-muted">
                  {raising.targetType === "listing"
                    ? "No rejected listing is waiting on one."
                    : "No suspended account is waiting on one."}
                </p>
              )}
            </Field>

            <Field label="Appellant" hint="Who is appealing">
              <input
                value={raising.appellant}
                onChange={(e) =>
                  setRaising({ ...raising, appellant: e.target.value })
                }
                placeholder="Theo L."
                className={`${FIELD} ${border(false)}`}
              />
            </Field>

            <Field label="Their message" hint="Optional">
              <textarea
                value={raising.message}
                onChange={(e) =>
                  setRaising({ ...raising, message: e.target.value })
                }
                rows={3}
                placeholder="What they said when they asked for another look."
                className={`${FIELD} ${border(false)} resize-none`}
              />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
