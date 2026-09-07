"use client";

import { Check, MapPin, Pencil } from "lucide-react";
import { stepIndex } from "../../lib/adDraft";

function Row({ label, value, onEdit }) {
  return (
    <div className="flex items-start gap-3 border-t border-line py-3 first:border-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
        <p className="mt-0.5 whitespace-pre-line break-words text-[15px] text-ink">
          {value || "—"}
        </p>
      </div>
      <button
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-brand"
      >
        <Pencil className="size-4" />
      </button>
    </div>
  );
}

export default function StepReview({ draft, onEdit }) {
  const toPhotos = () => onEdit(stepIndex("photos"));
  const toDetails = () => onEdit(stepIndex("details"));
  const toContact = () => onEdit(stepIndex("contact"));

  return (
    <div className="space-y-5">
      {/* How the ad will look in the feed. */}
      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
          Preview
        </p>
        <div className="relative flex gap-3 rounded-2xl bg-canvas p-3">
          {draft.images[0] ? (
            <img
              src={draft.images[0].url}
              alt=""
              className="size-[72px] shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="size-[72px] shrink-0 rounded-xl bg-line" />
          )}
          <div className="min-w-0 flex-1 pr-7">
            <h3 className="text-[17px] font-bold leading-tight text-ink">
              {draft.title || "Untitled ad"}
            </h3>
            <p className="mt-1 text-[12px] font-medium text-muted">
              {draft.business}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {draft.price !== "" && (
                <>
                  <span className="text-[12px] font-semibold text-brand">
                    ${Number(draft.price).toLocaleString()}
                  </span>
                  <span className="text-[12px] text-muted">·</span>
                </>
              )}
              <span className="text-[12px] font-medium text-muted">
                {draft.category}
              </span>
              {draft.location && (
                <span className="flex items-center gap-0.5 rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted">
                  <MapPin className="size-3" />
                  {draft.location}
                </span>
              )}
            </div>
          </div>
          <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-emerald-500">
            <Check className="size-4 text-white" strokeWidth={3.5} />
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-line p-4">
        <Row
          label="Photos"
          value={`${draft.images.length} photo${draft.images.length === 1 ? "" : "s"}`}
          onEdit={toPhotos}
        />
        <Row label="Title" value={draft.title} onEdit={toDetails} />
        <Row label="Description" value={draft.description} onEdit={toDetails} />
        <Row label="Location" value={draft.location} onEdit={toContact} />
        <Row label="Email" value={draft.email} onEdit={toContact} />
        <Row label="Phone" value={draft.phone} onEdit={toContact} />
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Ads are reviewed before they go live. Most are approved within a couple
        of hours.
      </p>
    </div>
  );
}
