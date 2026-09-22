"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import ChoiceRow from "./ui/ChoiceRow";
import Field, { FIELD, border } from "./create/Field";
import { useReports } from "../context/ReportsContext";
import { useToast } from "../context/ToastContext";
import { MAX_DETAIL, reasonsFor } from "../lib/reports";
import { reportListing } from "../lib/api/moderation.js";
import { SITE_SCOPE } from "../lib/api/client.js";

/**
 * This dialog's local reason ids next to the backend's `ReportReason` enum
 * (SPAM, FRAUD, PROHIBITED, SAFETY, OTHER —
 * cc.vezlist.moderation.domain.ModerationPolicy.ReportReason). The two
 * taxonomies were never going to line up one-to-one: `lib/reports.js`'s
 * list is 12 reasons shared across listings, sellers and live broadcasts,
 * and the server only knows a closed set of 5 for a listing report. Every
 * mapping below is a best fit rather than an exact one, and the reporter's
 * own words survive regardless in `detail`.
 */
const BACKEND_REASON = {
  scam: "FRAUD",
  prohibited: "PROHIBITED",
  misleading: "OTHER",
  duplicate: "SPAM",
  miscategorised: "OTHER",
  offPlatform: "FRAUD",
  escort: "PROHIBITED",
  underage: "SAFETY",
  nudity: "PROHIBITED",
  other: "OTHER",
};

/**
 * Report an ad, a seller or a live broadcast.
 *
 * One dialog for all three because the three differ only in which reasons are
 * offered — and that difference is data, in `REPORT_REASONS`. Three copies of
 * this form would be three chances for the ad detail page to accept a reason
 * the queue cannot action.
 *
 * ── Where a report actually goes now ──────────────────────────────────────
 *
 * Only a listing report has a real endpoint behind it —
 * POST /api/v1/listings/{id}/reports (ModerationController#report). A
 * seller or a live-broadcast report has no such thing on the backend today,
 * so those two keep the original local-only behaviour and the original
 * "this preview has no server behind it" copy; only the listing path below
 * calls the real API, and its confirmation says so truthfully. Every report,
 * real or local-only, is still written to this device's `ReportsContext` —
 * that is what drives the "already reported" state and the Settings receipt
 * list, and it costs nothing to keep doing both.
 */
export default function ReportDialog({
  open,
  targetType,
  targetId,
  targetLabel,
  site = SITE_SCOPE,
  onClose,
}) {
  const { report, reportOf } = useReports();
  const toast = useToast();
  const [reasonId, setReasonId] = useState(null);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentToServer, setSentToServer] = useState(false);
  /**
   * The confirmation lives in the dialog rather than only in a toast.
   *
   * Partly because what has to be said — recorded here, not sent anywhere yet
   * — is more than a toast should carry, and partly because the live player is
   * a full-screen route outside `AppLayout`, where `useToast` falls back to a
   * no-op. A confirmation that silently does not appear on one of the three
   * report surfaces is the same class of defect as the button that did
   * nothing.
   */
  const [done, setDone] = useState(false);

  const reasons = reasonsFor(targetType);
  const chosen = reasons.find((r) => r.id === reasonId) ?? null;
  const already = reportOf(targetType, targetId);

  function close() {
    setReasonId(null);
    setDetail("");
    setError(null);
    setDone(false);
    setSentToServer(false);
    setSubmitting(false);
    onClose();
  }

  async function submit() {
    if (!chosen) {
      setError("Pick a reason.");
      return;
    }
    // The reducer refuses this too — the form is the courtesy, the reducer is
    // the rule. A moderator cannot act on "Something else" with nothing under
    // it, so it is not accepted with nothing under it.
    if (chosen.needsDetail && !detail.trim()) {
      setError("Tell us what is wrong — this reason needs a line of detail.");
      return;
    }

    if (targetType === "listing") {
      setSubmitting(true);
      setError(null);
      try {
        await reportListing(targetId, {
          site,
          reason: BACKEND_REASON[chosen.id] ?? "OTHER",
          details: detail || undefined,
        });
        setSentToServer(true);
      } catch (err) {
        setSubmitting(false);
        setError(
          err.message ||
            "Couldn't send this report — check your connection and try again.",
        );
        return;
      }
      setSubmitting(false);
    }

    report({ targetType, targetId, reasonId: chosen.id, detail });
    toast(
      targetType === "listing"
        ? "Report sent"
        : "Report recorded on this device — see Settings",
    );
    setDone(true);
  }

  if (done) {
    return (
      <Modal
        open={open}
        title={sentToServer ? "Report sent" : "Report recorded"}
        subtitle={targetLabel}
        onClose={close}
        size="max-w-md"
        footer={
          <Button size="lg" className="w-full" onClick={close}>
            Done
          </Button>
        }
      >
        {sentToServer ? (
          // The truthful sentence this branch exists to be able to say: this
          // one target type (a listing) really did reach a moderator, via
          // POST /api/v1/listings/{id}/reports — unlike the copy below, which
          // still applies to a seller or a broadcast report.
          <>
            <p className="text-[15px] leading-relaxed text-ink/75">
              Our moderation team has received this report and will review it.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
              It is also listed under Account Settings on this device. What
              does work right now beyond that: blocking. It hides that
              person's ads from your feed straight away.
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-ink/75">
              It is saved on this device and listed under Account Settings.
            </p>
            {/*
              The sentence this whole dialog exists to be able to say
              truthfully for a seller or a live-broadcast report — the
              backend has no endpoint for either of those yet.
            */}
            <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
              It has <strong>not</strong> been sent to a moderator — there is
              no server-side reporting for this yet, and the moderation
              console cannot read what this app stores. Nothing you do here
              will change that on its own.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
              What does work right now: blocking. It hides that person's ads
              from your feed straight away.
            </p>
          </>
        )}
      </Modal>
    );
  }

  /**
   * Reporting the same thing twice tells a moderator nothing the first one
   * did not, so the second attempt shows what was already filed rather than
   * a form that would be silently discarded.
   */
  if (already) {
    return (
      <Modal
        open={open}
        title="Already reported"
        subtitle={targetLabel}
        onClose={close}
        size="max-w-md"
        footer={
          <Button size="lg" className="w-full" onClick={close}>
            Close
          </Button>
        }
      >
        <p className="text-[15px] leading-relaxed text-ink/75">
          You reported this for <strong>{already.reason}</strong>. It is saved
          on this device and listed under Account Settings. Reporting it again
          would not tell a moderator anything new.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Report this"
      subtitle={targetLabel}
      onClose={close}
      size="max-w-md"
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={close}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="lg"
            className="flex-1"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "Sending…" : "Report"}
          </Button>
        </div>
      }
    >
      <div role="radiogroup" aria-label="Reason" className="-mx-3">
        {reasons.map((reason) => (
          <ChoiceRow
            key={reason.id}
            type="radio"
            checked={reasonId === reason.id}
            onChange={() => {
              setReasonId(reason.id);
              setError(null);
            }}
          >
            {reason.label}
          </ChoiceRow>
        ))}
      </div>

      <div className="mt-3">
        <Field
          label={chosen?.needsDetail ? "What is wrong?" : "Anything to add?"}
          hint={
            chosen?.needsDetail
              ? "Required"
              : `Optional · ${MAX_DETAIL - detail.length} left`
          }
          error={error}
        >
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, MAX_DETAIL))}
            rows={3}
            maxLength={MAX_DETAIL}
            placeholder="What should a moderator look at?"
            className={`${FIELD} resize-none ${border(error)}`}
          />
        </Field>
      </div>

      {/* Said before submitting, not only after. Somebody deciding whether to
          bother reporting deserves to know what reporting currently does. */}
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-3 text-[13px] leading-relaxed text-muted">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
        <span>
          {targetType === "listing" ? (
            "This report is sent to our moderation team. It is also saved on this device and listed in Account Settings. If someone is in danger, contact the local authorities."
          ) : (
            "There is no server-side reporting for this yet. Your report is saved on this device and listed in Account Settings — it has not reached a moderator. If someone is in danger, contact the local authorities."
          )}
        </span>
      </p>
    </Modal>
  );
}
