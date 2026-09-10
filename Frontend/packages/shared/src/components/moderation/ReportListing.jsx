"use client";

import { useId, useRef, useState } from "react";
import Button from "../ui/Button";
import { api } from "../../lib/api";
import { REPORT_REASONS, reportListing } from "../../lib/moderation";
import { SITE } from "../../lib/sites";

export default function ReportListing({ listingId, ready, signedIn }) {
  const formId = useId();
  const inFlight = useRef(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || !ready || !signedIn) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await reportListing(api, listingId, SITE, reason, details);
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <details className="mt-4 rounded-card bg-surface p-4 text-[14px] shadow-card lg:mt-0 lg:p-6">
      <summary className="cursor-pointer font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand">
        Report this ad
      </summary>
      <p className="mt-3 text-muted">
        Tell our moderation team about content that may break the rules. Reports
        are reviewed before action is taken.
      </p>
      {!ready ? (
        <p className="mt-3 text-muted" role="status">
          Checking your account...
        </p>
      ) : !signedIn ? (
        <Button
          className="mt-3"
          variant="soft"
          to={`/login?next=${encodeURIComponent(`/ad/${listingId}`)}`}
        >
          Sign in to report
        </Button>
      ) : submitted ? (
        <p className="mt-3 text-ink" role="status">
          Report submitted. Our moderation team will review it.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3" aria-busy={pending}>
          <div>
            <label
              className="block font-semibold text-ink"
              htmlFor={`${formId}-reason`}
            >
              Reason
            </label>
            <select
              id={`${formId}-reason`}
              required
              disabled={pending}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas p-3 text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <option value="">Choose a reason</option>
              {REPORT_REASONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block font-semibold text-ink"
              htmlFor={`${formId}-details`}
            >
              Details (optional)
            </label>
            <textarea
              id={`${formId}-details`}
              disabled={pending}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              rows={4}
              aria-describedby={`${formId}-limit`}
              className="mt-2 w-full rounded-xl border border-line bg-canvas p-3 text-ink focus-visible:outline-2 focus-visible:outline-brand"
            />
            <p id={`${formId}-limit`} className="mt-1 text-[12px] text-muted">
              Up to 1,000 characters. Do not include passwords or payment
              details.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" variant="soft" disabled={pending || !reason}>
            {pending ? "Submitting..." : "Submit report"}
          </Button>
        </form>
      )}
    </details>
  );
}
