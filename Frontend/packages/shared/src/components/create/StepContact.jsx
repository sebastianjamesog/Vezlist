"use client";

import Field, { FIELD, border } from "./Field";
import LocationPicker from "./LocationPicker";

export default function StepContact({ draft, errors, onPatch }) {
  return (
    <div className="space-y-4">
      <LocationPicker draft={draft} error={errors.location} onPatch={(patch) => onPatch({
        ...patch,
        ...(patch.locationId !== draft.locationId ? { latitude: null, longitude: null } : {}),
      })} />

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

      {/*
        This note used to promise a Show control that did not exist anywhere in
        the app, and promised it for the email as well as the phone. Both halves
        are corrected with issue #25: the reveal ships, it covers the number
        only, and the switch that governs it is named so a poster can find it.

        Worth being blunt about the last line, because it is the part a poster
        gets wrong: there is no messaging on Vezlist, so a buyer who cannot see
        a number has no way to reach them at all.
      */}
      <p className="rounded-xl bg-canvas px-4 py-3 text-[13px] leading-relaxed text-muted">
        Buyers see your number masked and tap <strong>Show</strong> to reveal
        it. Turn it off any time under{" "}
        <strong>Account Settings → Privacy → Show phone on ads</strong> — but
        with it off, buyers have no way to contact you about this ad.
      </p>
    </div>
  );
}
