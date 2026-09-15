"use client";

import Field, { FIELD, border } from "./Field";
import { availabilityOptions, ethnicities } from "../../data/mock";
import { CREATE_CATEGORIES, isPersonalsCategory } from "../../lib/adDraft";
import { subsFor } from "../../lib/taxonomy";

const PILL =
  "rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors";
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
  const subs = subsFor(draft.category);
  const personals = isPersonalsCategory(draft.category);

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

      <Field label="Category" error={errors.category}>
        <div className="flex flex-wrap gap-2">
          {CREATE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={draft.category === c}
              /*
                The sub-category rides along in the same patch rather than being
                cleared by an effect watching `draft.category`. An effect would
                run a render *after* the switch, so there is a frame in which the
                draft says "Property › Motorcycles" — and that frame is exactly
                the one a validation or an auto-advance could read. Clearing it
                in the same state update means the illegal pair never exists.
              */
              onClick={() => onPatch({ category: c, subcategory: "" })}
              className={`${PILL} ${pill(draft.category === c)}`}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      {/*
        Nothing to ask until there is a category, and nothing to ask for the
        handful of categories that carry no `subs`. An empty or disabled picker
        would still read as a question the poster has failed to answer, so the
        field is absent instead of inert.
      */}
      {subs.length > 0 && (
        <Field label="Sub-category" hint="Optional" error={errors.subcategory}>
          <div className="flex flex-wrap gap-2">
            {/*
              "None" is its own pill rather than a second press on the chosen one
              toggling it off. Toggle-off is invisible: nothing on the screen says
              a pressed pill can be un-pressed, and a keyboard user tabbing the
              row would never find it. With an explicit pill, "they did not want
              one" is a state that is selected, announced and reachable by Tab
              like every other option — and the row starts out visibly answered
              rather than looking like a question left hanging.
            */}
            <button
              type="button"
              aria-pressed={!draft.subcategory}
              onClick={() => onPatch({ subcategory: "" })}
              className={`${PILL} ${pill(!draft.subcategory)}`}
            >
              None
            </button>
            {subs.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={draft.subcategory === s}
                onClick={() => onPatch({ subcategory: s })}
                className={`${PILL} ${pill(draft.subcategory === s)}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Price" hint="Optional" error={errors.price}>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted">
            $
          </span>
          <input
            value={draft.price}
            onChange={(e) => onPatch({ price: e.target.value })}
            type="number"
            min="0"
            inputMode="numeric"
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
        The personals group, and only for a category that is about a person.
        Someone selling a dining table is never shown a field for their eye
        colour — not disabled, not greyed, absent, the same way the
        sub-category picker is absent for a category that has no subs.

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

          <Field label="Ethnicity" hint="Optional" error={errors.ethnicity}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!draft.ethnicity}
                onClick={() => onPatch({ ethnicity: "" })}
                className={`${PILL} ${pill(!draft.ethnicity)}`}
              >
                Prefer not to say
              </button>
              {ethnicities.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={draft.ethnicity === e}
                  onClick={() => onPatch({ ethnicity: e })}
                  className={`${PILL} ${pill(draft.ethnicity === e)}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}
