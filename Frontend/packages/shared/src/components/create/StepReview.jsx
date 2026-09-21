"use client";

import { Check, MapPin, Pencil } from "lucide-react";
import { isPersonalsCategory, stepIndex } from "../../lib/adDraft";
import { categoryPath } from "../../lib/taxonomy";
import MediaImage from "../media/MediaImage.jsx";

/*
  The personals group, in the order the ad detail page lists it, so the poster
  reviewing the draft is reading the same sequence the reader will.

  Name and city are not in it because they are not fields of their own — the
  rows below already carry them as Title's neighbour and as Location.
*/
const PERSONAL_FIELDS = [
  ["age", "Age"],
  ["ethnicity", "Ethnicity"],
  ["availability", "Availability"],
  ["height", "Height"],
  ["weight", "Weight"],
  ["bodyStats", "Body stats"],
  ["hairColour", "Hair colour"],
  ["eyeColour", "Eye colour"],
];

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
  // One string for both places it appears below, because the preview chip and
  // the summary row are describing the same single decision — if one of them
  // ever showed "Vehicles" while the other showed "Vehicles › Boats" the poster
  // would have to work out which one the ad is actually going to be filed under.
  const path = categoryPath(draft.category, draft.subcategory);
  /*
    Only the ones that were filled in.

    Every field in this group is optional, so eight rows of "—" is the most
    likely outcome and the least useful one: it turns the summary into a list of
    things the poster declined to do, buries the four rows that decide whether
    the ad is right, and pushes Publish off the screen. A skipped optional field
    is not an omission to be reported back — it is the poster having answered.
  */
  const personalRows = isPersonalsCategory(draft.category)
    ? PERSONAL_FIELDS.filter(([key]) => draft[key])
    : [];
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
            <MediaImage
              src={draft.images[0].url}
              alt=""
              width={72}
              height={72}
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
              <span className="text-[12px] font-medium text-muted">{path}</span>
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
        {/*
          One row, reading "Vehicles › Boats". A second "Sub-category" row would
          split a single choice into two lines and give the skipped case its own
          empty row to answer for — an em dash where the poster deliberately
          chose nothing, which reads as something left undone.
        */}
        <Row label="Category" value={path} onEdit={toDetails} />
        <Row label="Description" value={draft.description} onEdit={toDetails} />
        {personalRows.map(([key, label]) => (
          <Row key={key} label={label} value={draft[key]} onEdit={toDetails} />
        ))}
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
