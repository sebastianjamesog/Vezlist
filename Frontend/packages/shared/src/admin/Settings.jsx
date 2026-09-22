"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminData } from "../context/AdminDataContext";
import { useToast } from "../context/ToastContext";
import { MARKETPLACE_URL, PERSONALS_URL } from "../lib/sites";

/**
 * Console settings, and the one place the limitation is stated on the page
 * rather than only in the build plan.
 *
 * These flags write to the console's own store. The public sites are two other
 * origins with two other storages and no server in between, so nothing here
 * reaches them. Saying so on the screen is cheaper than someone discovering it
 * by flipping the age-gate copy and refreshing personals.
 */

const FLAGS = [
  {
    key: "discreetByDefault",
    label: "Discreet mode on by default",
    sub: "Personals opens with every photo blurred until it is tapped.",
  },
  {
    key: "liveEnabled",
    label: "Live broadcasts",
    sub: "The Live tab and the status-tray rings.",
  },
  {
    key: "statusEnabled",
    label: "Status updates",
    sub: "The 24-hour update tray on personals.",
  },
  {
    key: "autoApproveMarketplace",
    label: "Auto-approve marketplace ads",
    sub: "Skip the queue on vezlist.cc. Reports still come through.",
  },
  {
    key: "autoApprovePersonals",
    label: "Auto-approve personals ads",
    sub: "Not recommended — this board is why the queue exists.",
  },
];

export default function Settings() {
  const { state, dispatch, reset } = useAdminData();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  const { settings } = state;

  const set = (key, value) => dispatch({ type: "setSetting", key, value });

  /** Writes only a real change — tabbing through a field is not an edit. */
  function commit(key, value) {
    if (value === settings[key]) return;
    set(key, value);
    toast("Setting saved");
  }

  return (
    <>
      <AdminHeader
        title="Settings"
        subtitle="Copy, feature flags, and the reset switch"
      />

      <div className="mb-4 flex items-start gap-3 rounded-card bg-amber-50 p-4 ring-1 ring-amber-200">
        <TriangleAlert
          className="size-5 shrink-0 text-amber-700"
          strokeWidth={2.4}
          aria-hidden="true"
        />
        <div className="min-w-0 text-[13.5px] leading-relaxed text-amber-900">
          <p className="font-bold">These flags do not reach the live sites.</p>
          <p>
            The console is a third origin with its own storage and there is no
            server between the three, so everything on this screen is written
            here and read here. Wiring it through means an API — one file,{" "}
            <code className="rounded bg-amber-100 px-1">AdminDataContext</code>{" "}
            — and a backend to point it at.{" "}
            <a
              href={MARKETPLACE_URL}
              className="font-semibold underline"
              target="_blank"
              rel="noreferrer"
            >
              vezlist.cc
            </a>{" "}
            and{" "}
            <a
              href={PERSONALS_URL}
              className="font-semibold underline"
              target="_blank"
              rel="noreferrer"
            >
              personals
            </a>{" "}
            still read their own copies.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="mb-1 text-[17px] font-extrabold text-ink">Age gate</h2>
          <p className="mb-3 text-[13px] text-muted">
            What personals shows before it shows anything else.
          </p>
          {/* Every field below is uncontrolled and committed on blur, so each
              carries the stored value as its `key`. Without that, React keeps
              the DOM node it already mounted and ignores the new
              `defaultValue` — so **Reset to seed** would restore the store
              while the boxes still showed the old copy, and the next blur
              would quietly write that copy back over the reset, with an audit
              entry blaming a human for it. */}
          <div className="flex flex-col gap-4">
            <Field label="Heading">
              <input
                key={settings.ageGateTitle}
                defaultValue={settings.ageGateTitle}
                onBlur={(e) => commit("ageGateTitle", e.target.value.trim())}
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field label="Body">
              <textarea
                key={settings.ageGateBody}
                defaultValue={settings.ageGateBody}
                rows={3}
                onBlur={(e) => commit("ageGateBody", e.target.value.trim())}
                className={`${FIELD} ${border(false)} resize-none`}
              />
            </Field>
            <Field
              label="Review target"
              hint="Hours a queued ad should wait, at most"
            >
              <input
                type="number"
                min={1}
                max={72}
                key={settings.reviewSlaHours}
                defaultValue={settings.reviewSlaHours}
                // Clamped, because `min` is a hint to the browser and an empty
                // box coerces to 0 — which is not a review target.
                onBlur={(e) =>
                  commit(
                    "reviewSlaHours",
                    Math.min(72, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
          </div>
        </section>

        <section className={CARD}>
          <h2 className="mb-1 text-[17px] font-extrabold text-ink">
            Service levels
          </h2>
          <p className="mb-3 text-[13px] text-muted">
            How long a queue row waits before Reports and Tickets flag it
            overdue. Listings uses the review target above.
          </p>
          <div className="flex flex-col gap-4">
            <Field
              label="Report response target"
              hint="Hours an open report should wait, at most"
            >
              <input
                type="number"
                min={1}
                max={168}
                key={settings.reportSlaHours}
                defaultValue={settings.reportSlaHours}
                onBlur={(e) =>
                  commit(
                    "reportSlaHours",
                    Math.min(168, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field
              label="Ticket response target"
              hint="Hours an open ticket should wait, at most"
            >
              <input
                type="number"
                min={1}
                max={168}
                key={settings.ticketSlaHours}
                defaultValue={settings.ticketSlaHours}
                onBlur={(e) =>
                  commit(
                    "ticketSlaHours",
                    Math.min(168, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
          </div>
        </section>

        <section className={CARD}>
          <h2 className="mb-1 text-[17px] font-extrabold text-ink">
            Feature flags
          </h2>
          <p className="mb-2 text-[13px] text-muted">
            What the two boards offer their members.
          </p>
          <ul className="divide-y divide-line">
            {FLAGS.map((flag) => (
              <li key={flag.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold text-ink">
                    {flag.label}
                  </p>
                  <p className="text-[12.5px] leading-snug text-muted">
                    {flag.sub}
                  </p>
                </div>
                <Switch
                  checked={Boolean(settings[flag.key])}
                  label={flag.label}
                  onChange={(on) => set(flag.key, on)}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className={`${CARD} lg:col-span-2`}>
          <h2 className="mb-1 text-[17px] font-extrabold text-ink">
            Reset to seed
          </h2>
          <p className="mb-3 text-[13px] leading-relaxed text-muted">
            Throws away every edit made in this console and rebuilds the state
            from <code className="rounded bg-canvas px-1">mock.js</code>. The
            audit log goes with it. This is the demo reset, and the only way
            back from a session of clicking about.
          </p>
          <Button variant="danger" onClick={() => setResetting(true)}>
            Reset the console
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={resetting}
        title="Reset every change?"
        body="Approvals, rejections, suspensions, replies and the audit log all go. There is no undo."
        confirmLabel="Reset"
        destructive
        onClose={() => setResetting(false)}
        onConfirm={() => {
          reset();
          toast("Console reset to seed");
          setResetting(false);
        }}
      />
    </>
  );
}

/** A real checkbox under a switch-shaped label, so the keyboard still works. */
function Switch({ checked, label, onChange }) {
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand" />
      <span className="absolute left-0.5 size-5 rounded-full bg-white shadow-card transition-transform peer-checked:translate-x-5" />
    </label>
  );
}
