"use client";

import { Funnel } from "lucide-react";
import { activeFilterChips, activeFilterCount } from "../lib/filters";

/**
 * The pill beside the result count. It opens the same sheet the search row's
 * icon does — that one is reachable with a thumb, this one sits next to the
 * number it changes, which is where you look when the number is wrong.
 *
 * It says what is applied rather than "Filter" over a board that is already
 * cut: a single narrowing wears its own name, several are counted, because
 * three labels in a pill is a sentence and not a button. The label is keyed on
 * its own text, so React swaps the element when it changes and the animation
 * replays — the same control answering again, not a new control arriving.
 */
export default function FilterButton({ filters, onClick, className = "" }) {
  const chips = activeFilterChips(filters);
  // Chips are per value and the count is per group: two cities are two chips
  // and one filter. Naming beats counting only when there is one of each.
  const label =
    chips.length === 0
      ? "Filter"
      : chips.length === 1
        ? chips[0].label
        : `${activeFilterCount(filters)} filters`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={chips.length ? `Filters: ${label}` : "Filters"}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold shadow-card transition-transform hover:-translate-y-0.5 active:scale-95 ${
        chips.length ? "bg-brand-soft text-brand" : "bg-surface text-ink"
      } ${className}`}
    >
      <Funnel className="size-3.5 shrink-0" strokeWidth={2.4} />
      <span key={label} className="swap-in max-w-[9rem] truncate">
        {label}
      </span>
    </button>
  );
}
