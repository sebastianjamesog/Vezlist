"use client";

/**
 * One tone map for every status word in the console.
 *
 * Thirteen screens show statuses and they must not each invent their own
 * green. Anything not in the map falls through to the neutral chip rather
 * than to an unstyled span, so a new status word is legible on arrival and
 * merely uncoloured.
 */
const TONES = {
  // Good, settled, done.
  active: "bg-emerald-100 text-emerald-700",
  resolved: "bg-emerald-100 text-emerald-700",
  sent: "bg-emerald-100 text-emerald-700",
  // Needs a human.
  pending: "bg-amber-100 text-amber-700",
  open: "bg-amber-100 text-amber-700",
  // Turned away, or taken down.
  rejected: "bg-red-100 text-red-700",
  suspended: "bg-red-100 text-red-700",
  // Broadcasting right now — the same red every live product uses.
  live: "bg-red-100 text-red-700",
  // Over, of its own accord.
  expired: "bg-slate-200 text-slate-600",
  ended: "bg-slate-200 text-slate-600",
  dismissed: "bg-slate-200 text-slate-600",
  // Decided appeals: the original decision stood, or it was reversed.
  upheld: "bg-slate-200 text-slate-600",
  overturned: "bg-emerald-100 text-emerald-700",
  // Attributes rather than states.
  verified: "bg-sky-100 text-sky-700",
  boosted: "bg-violet-100 text-violet-700",
  marketplace: "bg-blue-100 text-blue-700",
  personals: "bg-indigo-100 text-indigo-700",
};

/** Where the console's word is not the word a moderator would say out loud. */
const LABELS = {
  pending: "In review",
  open: "Open",
  live: "Live now",
};

const NEUTRAL = "bg-canvas text-muted";

export default function StatusBadge({
  status,
  label,
  dot = false,
  className = "",
}) {
  const key = String(status ?? "").toLowerCase();
  const text =
    label ?? LABELS[key] ?? (key ? key[0].toUpperCase() + key.slice(1) : "—");

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONES[key] ?? NEUTRAL} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-current opacity-80"
        />
      )}
      {text}
    </span>
  );
}
