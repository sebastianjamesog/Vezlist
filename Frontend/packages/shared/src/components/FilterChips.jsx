"use client";

import { X } from "lucide-react";
import { activeFilterChips } from "../lib/filters";

export default function FilterChips({ filters, onPatch, onClearAll }) {
  const chips = activeFilterChips(filters);
  if (!chips.length) return null;

  return (
    <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onPatch(chip.clear)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft py-1.5 pl-3.5 pr-2.5 text-[13px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
        >
          {chip.label}
          <X className="size-3.5" strokeWidth={3} />
        </button>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        Clear all
      </button>
    </div>
  );
}
