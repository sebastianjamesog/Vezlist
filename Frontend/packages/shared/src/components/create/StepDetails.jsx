"use client";

import Field, { FIELD, border } from "./Field";
import { availabilityOptions } from "../../data/mock";
import useEthnicities from "../../hooks/useEthnicities.js";
import { isPersonalsCategory } from "../../lib/adDraft";
import CategoryPicker from "./CategoryPicker";

const PILL =
  "max-w-full break-words rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors";
const pill = (on) =>
  on
    ? "border-brand bg-brand text-on-brand"
    : "border-line text-ink hover:bg-canvas";

/*
  The six short, free-text answers a personals post carries, as one table
  rather than six hand-written blocks. The other two — availability and
  ethnicity — are closed lists and live in the pills below.

  They are a table because there is nothing to say about any one of them: same
  input, same optionality, same two-column cell. Written out longhand they would
  be sixty lines in which the only thing that varies is a placeholder, and the
  next field added to the group would be a copy-paste with one word changed —
  which is how a form ends up with two fields wired to the same key.

  Age and weight are the two that carry a `type`, because they are the two the
  validator has an opinion about; the rest are whatever the poster wants to say.
*/
const PERSONAL_FIELDS = [
  { key: "age", label: "Age", placeholder: "e.g. 28", type: "number" },
  { key: "height", label: "Height", placeholder: "e.g. 165 cm" },
  { key: "weight", label: "Weight", placeholder: "e.g. 54 kg" },
  { key: "bodyStats", label: "Body stats", placeholder: "e.g. 34-26-36" },
  { key: "hairColour", label: "Hair colour", placeholder: "e.g. Brown" },
  { key: "eyeColour", label: "Eye colour", placeholder: "e.g. Hazel" },
];

export default function StepDetails({ draft, errors, onPatch }) {
  const personals = isPersonalsCategory(draft.category);
  const {
    status: ethnicityStatus,
    ethnicities,
    retry: retryEthnicities,
  } = useEthnicities({ enabled: personals });
  const savedEthnicity =
    draft.ethnicity &&
    !ethnicities.some((option) => option.label === draft.ethnicity);

  return (
    <div className="space-y-4">
      <Field
        label="Title"
        error={errors.title}
        hint={`${draft.title.length}/70`}
      >
        <input
          value={draft.title}
          maxLength={70}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="e.g. 2 Bedroom Apartment for Rent"
          className={`${FIELD} ${border(errors.title)}`}
        />
      </Field>

      <Field label="Business / Seller name" error={errors.business}>
        <input
          value={draft.business}
          onChange={(e) => onPatch({ business: e.target.value })}
          placeholder="e.g. Modern City Apartments"
          className={`${FIELD} ${border(errors.business)}`}
        />
      </Field>

      <CategoryPicker draft={draft} error={errors.category} onPatch={onPatch} />

      <Field label="Price" hint="Optional, up to $9,999" error={errors.price}>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted">
            $
          </span>
          <input
            value={draft.price}
            onChange={(e) => onPatch({ price: e.target.value })}
            type="number"
            min="0"
            max="9999"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
            className={`${FIELD} ${border(errors.price)} pl-8`}
          />
        </div>
      </Field>

      <Field
        label="Description"
        hint={`${draft.description.trim().length}/20 min`}
        error={errors.description}
      >
        <textarea
          value={draft.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          rows={5}
          placeholder="Condition, why you're selling, what's included..."
          className={`${FIELD} ${border(errors.description)} resize-none`}
        />
      </Field>

      {/*
        The personals group belongs to the Personals board, including categories
        added or renamed by an administrator, and Marketplace's Dating category.
        Someone selling a dining table is never shown a field for their eye
        colour.

        It sits behind its own border and after the description rather than
        being mixed in above, because these answers are the long tail of the
        form: the ad is already postable without a single one of them, and a
        poster who scrolls to the end and stops has lost nothing that mattered.
        Putting them between "Category" and "Price" would make them read as part
        of the sequence you have to get through.

        There is no "Name" or "City" here either. Both are already asked — the
        name on this step, the city on the next — and asking twice would let one
        ad go out with two different names on it.
      */}
      {personals && (
        <div className="space-y-4 rounded-2xl border border-line bg-canvas p-4">
          <div>
            <p className="text-[14px] font-bold text-ink">About you</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              All optional. Fill in whatever you want on the ad — posts with a
              few of these get more replies, and a blank one still goes live.
            </p>
          </div>

          {/*
            Two columns: these are short answers, and stacked one per row they
            would push the description off the top of the sheet and turn a group
            you can skip into a screen you have to scroll past.
          */}
          <div className="grid grid-cols-2 gap-3">
            {PERSONAL_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} error={errors[f.key]}>
                <input
                  value={draft[f.key] ?? ""}
                  onChange={(e) => onPatch({ [f.key]: e.target.value })}
                  type={f.type ?? "text"}
                  inputMode={f.type === "number" ? "numeric" : undefined}
                  min={f.type === "number" ? "18" : undefined}
                  max={f.type === "number" ? "99" : undefined}
                  placeholder={f.placeholder}
                  className={`${FIELD} ${border(errors[f.key])}`}
                />
              </Field>
            ))}
          </div>

          {/*
            Pills, not selects, for the two closed lists — for the reason the
            personals filter gives: a handful of short labels reads as a set you
            take in at once, where a dropdown hides the options until you commit
            to opening it.

            Each list leads with its own opt-out pill, so "did not answer" is a
            state you can select, hear announced and reach with Tab, rather than
            the absence of a press. The two are worded differently on purpose:
            leaving availability blank is a question not yet answered, and
            leaving ethnicity blank is an answer.
          */}
          <Field label="Availability" hint="Optional">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!draft.availability}
                onClick={() => onPatch({ availability: "" })}
                className={`${PILL} ${pill(!draft.availability)}`}
              >
                None
              </button>
              {availabilityOptions.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={draft.availability === a}
                  onClick={() => onPatch({ availability: a })}
                  className={`${PILL} ${pill(draft.availability === a)}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </Field>

          <fieldset className="min-w-0">
            <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2">
              <span className="text-[14px] font-bold text-ink">Ethnicity</span>
              <span className="text-[12px] text-muted">Optional</span>
            </legend>
            {ethnicityStatus === "loading" && (
              <p role="status" className="mb-2 text-[13px] text-muted">
                Loading ethnicities...
              </p>
            )}
            {ethnicityStatus === "error" && (
              <div role="alert" className="mb-2 text-[13px] text-danger">
                Could not load ethnicities.{" "}
                <button
                  type="button"
                  onClick={retryEthnicities}
                  className="font-semibold underline"
                >
                  Retry ethnicities
                </button>
              </div>
            )}
            {ethnicityStatus === "success" && !ethnicities.length && (
              <p className="mb-2 text-[13px] text-muted">
                No ethnicity choices are available. You can leave this blank.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!draft.ethnicity}
                onClick={() => onPatch({ ethnicity: "" })}
                className={`${PILL} ${pill(!draft.ethnicity)}`}
              >
                Prefer not to say
              </button>
              {savedEthnicity && (
                <button
                  type="button"
                  aria-pressed="true"
                  title="Saved ethnicity"
                  className={`${PILL} ${pill(true)}`}
                >
                  {draft.ethnicity}
                </button>
              )}
              {ethnicities.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={draft.ethnicity === option.label}
                  onClick={() => onPatch({ ethnicity: option.label })}
                  className={`${PILL} ${pill(draft.ethnicity === option.label)}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {savedEthnicity && ethnicityStatus === "success" && (
              <p className="mt-2 text-[13px] text-muted">
                Your saved ethnicity is kept unless you change it.
              </p>
            )}
            {errors.ethnicity && (
              <p
                role="alert"
                className="mt-1.5 text-[13px] font-medium text-red-600"
              >
                {errors.ethnicity}
              </p>
            )}
          </fieldset>
        </div>
      )}
    </div>
  );
}
