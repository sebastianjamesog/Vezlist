"use client";

import { X } from "lucide-react";
import { activeFilterChips, reconcileSubcategory } from "../lib/filters";
import { categoryPath } from "../lib/taxonomy";

export default function FilterChips({
  filters,
  onPatch,
  onClearAll,
  query = "",
  onClearQuery,
}) {
  const chips = activeFilterChips(filters);
  if (!chips.length && !query.trim()) return null;

  // The one category a sub-category chip can belong to, if there is one. It is
  // never ambiguous: a sub-category only survives reconciliation under exactly
  // one category, so if a `sub:` chip exists this is its parent.
  const parent = filters.categories.length === 1 ? filters.categories[0] : null;

  return (
    <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {query.trim() && (
        <button
          type="button"
          onClick={onClearQuery}
          aria-label="Remove search"
          className="flex max-w-60 shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-[13px] font-bold text-brand"
        >
          <span className="truncate">Search: {query.trim()}</span>
          <X className="size-3.5 shrink-0" />
        </button>
      )}
      {chips.map((chip) => {
        const isSub = chip.key.startsWith("sub:");
        return (
          <button
            key={chip.key}
            type="button"
            /**
             * Chips carry patches, but a category chip's patch is the one that
             * can invalidate a *neighbouring* chip: drop Vehicles and the
             * Motorcycles chip beside it is narrowing against nothing. The
             * clear is merged onto the current filters and reconciled here so
             * the caller gets a whole, consistent state — every consumer of
             * this component spreads what it is handed, so a full object is a
             * valid patch and the alternative (teaching each screen to
             * reconcile after every chip) puts the same rule in three places.
             */
            onClick={() =>
              onPatch(reconcileSubcategory({ ...filters, ...chip.clear }))
            }
            /**
             * Read aloud, "Motorcycles" beside "Vehicles" is a second, peer
             * filter; it is actually a narrowing of the chip before it. The
             * full path is the accessible name, while the visible label keeps
             * only the chevron — spelling "Vehicles › Motorcycles" on the chip
             * would repeat the word already sitting to its left and cost most
             * of the row's width on a phone.
             */
            aria-label={`Remove ${isSub ? categoryPath(parent, chip.label) : chip.label}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft py-1.5 pl-3.5 pr-2.5 text-[13px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
          >
            {isSub ? `› ${chip.label}` : chip.label}
            <X className="size-3.5" strokeWidth={3} />
          </button>
        );
      })}

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
