"use client";

/**
 * Sliding pill switch (Province/Cities, Listings/People). These are toggle
 * buttons, not tabs — there are no tabpanels — so they use aria-pressed.
 */
export default function SegmentedControl({
  options,
  value,
  onChange,
  label,
  className = "",
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-all duration-200 ${
              active
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
