"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Button from "../ui/Button";
import { api } from "../../lib/api";
import { appealListing, createModerationQuery } from "../../lib/moderation";
import { listingStatus } from "../../lib/listings";
import { SITE } from "../../lib/sites";

export default function OwnerModeration({ listingId }) {
  const fieldId = useId();
  const query = useMemo(
    () => createModerationQuery(api, listingId, SITE),
    [listingId],
  );
  const review = useSyncExternalStore(
    query.subscribe,
    query.getSnapshot,
    query.getSnapshot,
  );
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || !review.data?.appealAllowed || submitted) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await appealListing(api, listingId, SITE, message);
      setSubmitted(true);
      query.load(true).catch(() => {});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <details
      className="mt-3 rounded-xl bg-canvas p-3 text-[13px]"
      onToggle={(event) => {
        if (event.currentTarget.open) query.load().catch(() => {});
      }}
    >
      <summary className="cursor-pointer font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand">
        Review details and appeals
      </summary>
      {submitted && (
        <p role="status" className="mt-3 text-ink">
          Appeal submitted. The moderation team will review your message.
        </p>
      )}
      {review.state === "loading" && (
        <p role="status" className="mt-3 text-muted">
          Loading review details...
        </p>
      )}
      {review.state === "error" && (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-red-700">
            {review.error.message}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => query.load(true).catch(() => {})}
          >
            Try again
          </Button>
        </div>
      )}
      {review.data && (
        <div className="mt-3 space-y-3">
          <p className="font-semibold text-ink">
            Status: {listingStatus(review.data.status).label}
          </p>
          <p className="whitespace-pre-wrap break-words text-muted">
            {review.data.publicReason || "No review reason has been shared."}
          </p>
          {review.data.appealAllowed && !submitted ? (
            <form onSubmit={submit} className="space-y-3" aria-busy={pending}>
              <label htmlFor={fieldId} className="block font-semibold text-ink">
                Explain why this decision should be reviewed
              </label>
              <textarea
                id={fieldId}
                value={message}
                disabled={pending}
                onChange={(event) => setMessage(event.target.value)}
                required
                maxLength={2000}
                rows={4}
                aria-describedby={`${fieldId}-limit`}
                className="w-full rounded-xl border border-line bg-surface p-3 text-ink focus-visible:outline-2 focus-visible:outline-brand"
              />
              <p id={`${fieldId}-limit`} className="text-[12px] text-muted">
                Up to 2,000 characters. Include information that helps us review
                this ad.
              </p>
              {error && (
                <p role="alert" className="text-red-700">
                  {error}
                </p>
              )}
              <Button
                size="sm"
                type="submit"
                variant="soft"
                disabled={pending || !message.trim()}
              >
                {pending ? "Submitting..." : "Submit appeal"}
              </Button>
            </form>
          ) : (
            !submitted &&
            ["REJECTED", "REMOVED"].includes(review.data.status) && (
              <p className="text-muted">
                An appeal is not currently available for this decision.
              </p>
            )
          )}
        </div>
      )}
    </details>
  );
}
