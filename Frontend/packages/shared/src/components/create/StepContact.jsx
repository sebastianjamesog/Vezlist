"use client";

import Field, { FIELD, border } from "./Field";
import { useCatalog } from "../../context/CatalogContext";

export default function StepContact({ draft, errors, onPatch }) {
  const { locationOptions, popularAreaOptions } = useCatalog();
  const province = locationOptions.find((item) => item.id === draft.provinceId);
  const areas = province?.areas ?? [];

  return (
    <div className="space-y-4">
      <Field label="Location" error={errors.location}>
        <select
          value={draft.provinceId}
          onChange={(event) =>
            onPatch({
              provinceId: event.target.value,
              locationId: "",
              location: "",
            })
          }
          className={`${FIELD} ${border(errors.location)}`}
        >
          <option value="">Choose a province or territory</option>
          {locationOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          value={draft.locationId}
          disabled={!province}
          onChange={(event) => {
            const area = areas.find((item) => item.id === event.target.value);
            onPatch({
              locationId: area?.id ?? "",
              location: area?.label ?? "",
            });
          }}
          className={`${FIELD} ${border(errors.location)} mt-2 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <option value="">Choose an area</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.label}
            </option>
          ))}
        </select>

        <span className="mt-2 flex flex-wrap gap-2">
          {popularAreaOptions.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() =>
                onPatch({
                  provinceId: area.provinceId,
                  locationId: area.id,
                  location: area.label,
                })
              }
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                draft.locationId === area.id
                  ? "border-brand bg-brand text-on-brand"
                  : "border-line text-ink hover:bg-canvas"
              }`}
            >
              {area.label}
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
