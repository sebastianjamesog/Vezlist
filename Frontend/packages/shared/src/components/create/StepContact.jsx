"use client";

import Field, { FIELD, border } from "./Field";
import { useCatalog } from "../../context/CatalogContext";

export default function StepContact({ draft, errors, onPatch }) {
  const { popularAreas } = useCatalog();

  return (
    <div className="space-y-4">
      <Field label="Location" error={errors.location}>
        <input
          value={draft.location}
          onChange={(e) => onPatch({ location: e.target.value })}
          placeholder="e.g. Metro Vancouver"
          className={`${FIELD} ${border(errors.location)}`}
        />
        <span className="mt-2 flex flex-wrap gap-2">
          {popularAreas.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPatch({ location: c })}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                draft.location === c
                  ? "border-brand bg-brand text-on-brand"
                  : "border-line text-ink hover:bg-canvas"
              }`}
            >
              {c}
            </button>
          ))}
        </span>
      </Field>

      <Field label="Email" error={errors.email}>
        <input
          value={draft.email}
          onChange={(e) => onPatch({ email: e.target.value })}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="e.g. seller@example.com"
          className={`${FIELD} ${border(errors.email)}`}
        />
      </Field>

      <Field label="Phone" error={errors.phone}>
        <input
          value={draft.phone}
          onChange={(e) => onPatch({ phone: e.target.value })}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="e.g. +1 250 555 1234"
          className={`${FIELD} ${border(errors.phone)}`}
        />
      </Field>

      <p className="rounded-xl bg-canvas px-4 py-3 text-[13px] leading-relaxed text-muted">
        Buyers only see your phone and email after tapping <strong>Show</strong>{" "}
        on the ad.
      </p>
    </div>
  );
}
