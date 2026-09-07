"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import TopBar from "@vezlist/shared/components/layout/TopBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import SearchBar from "@vezlist/shared/components/ui/SearchBar.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import LocationBar from "@vezlist/shared/components/LocationBar.jsx";
import FilterSheet from "@vezlist/shared/components/FilterSheet.jsx";
import FilterChips from "@vezlist/shared/components/FilterChips.jsx";
import { StoryRail } from "@vezlist/shared/components/StatusList.jsx";
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
import { useStatus } from "@vezlist/shared/context/StatusContext.jsx";
import { useToast } from "@vezlist/shared/context/ToastContext.jsx";
import { groupStatuses } from "@vezlist/shared/lib/status.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
} from "@vezlist/shared/lib/filters.js";
import { personalsListings, stories } from "@vezlist/shared/data/mock.js";
import ListingCard from "@vezlist/shared/components/cards/ListingCard.jsx";
import { useDiscreet } from "../useDiscreet";

/**
 * The home screen of personals.vezlist.cc.
 *
 * Everything here is one category, so there is no category strip and no
 * Category group in the filter sheet — the site *is* the category. The way out
 * is the Vezlist button in the bar, which crosses to the marketplace origin.
 *
 * The 18+ notice that used to sit at the top of this page is now the age gate
 * in the root layout: a strip you scroll past is not a declaration, and the
 * room it took is better spent on the board.
 */
export default function Personals() {
  const { filters, setFilters, query, setQuery } = useFeed();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [discreet, setDiscreet] = useDiscreet();
  const { seen } = useStatus();
  const toast = useToast();

  const { mine, recent, viewed } = groupStatuses(stories, seen);
  // Unwatched first, then the ones already seen — the tray scrolls, so all of
  // them fit and none has to be dropped.
  const shownStatuses = [...recent, ...viewed];

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));
  const visible = applyFilters(personalsListings, filters, query);
  const filterCount = activeFilterCount(filters);

  function resetAll() {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  }

  return (
    <>
      <TopBar
        title="Personals"
        exitHref={MARKETPLACE_URL}
        exitLabel="Vezlist"
      />

      <PageBody className="px-4 pb-8 lg:px-8">
        <div className="pb-3 pt-3 lg:pt-4">
          <div className="flex gap-2.5">
            <SearchBar
              className="flex-1"
              placeholder="Search personals…"
              value={query}
              onChange={setQuery}
            />

            {/* Discreet mode earns a permanent slot rather than a settings row:
                it is the control you reach for when someone walks in. */}
            <button
              onClick={() => setDiscreet((v) => !v)}
              aria-pressed={discreet}
              aria-label={discreet ? "Show photos" : "Blur photos"}
              title={discreet ? "Show photos" : "Blur photos"}
              className={`grid size-12 shrink-0 place-items-center rounded-card shadow-card transition-transform hover:-translate-y-0.5 active:scale-95 lg:size-[52px] ${
                discreet ? "bg-brand text-on-brand" : "bg-surface text-ink"
              }`}
            >
              {discreet ? (
                <EyeOff className="size-[18px]" strokeWidth={2.2} />
              ) : (
                <Eye className="size-[18px]" strokeWidth={2.2} />
              )}
            </button>

            <button
              onClick={() => setSheetOpen(true)}
              aria-label="Filters"
              className="relative grid size-12 shrink-0 place-items-center rounded-card bg-surface text-ink shadow-card transition-transform hover:-translate-y-0.5 active:scale-95 lg:size-[52px]"
            >
              <SlidersHorizontal className="size-[18px]" strokeWidth={2.2} />
              {filterCount > 0 && (
                <span className="brand-gradient absolute -right-1 -top-1 grid size-5 place-items-center rounded-full text-[11px] font-bold text-on-brand ring-2 ring-canvas">
                  {filterCount}
                </span>
              )}
            </button>
          </div>

          <LocationBar
            filters={filters}
            onPatch={patch}
            className="mt-2.5 min-w-0"
          />
        </div>

        <section className="pt-1">
          <div className="flex items-baseline justify-between pb-1">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
              Status
              {recent.length ? ` · ${recent.length} new` : ""}
            </h2>
            <Link
              href="/status"
              className="text-[13px] font-bold text-brand hover:underline"
            >
              See all
            </Link>
          </div>

          <StoryRail
            mine={mine}
            stories={shownStatuses}
            seen={seen}
            onAdd={() => toast("Posting a status is not wired up yet")}
          />
        </section>

        <div className="pt-3">
          <FilterChips
            filters={filters}
            onPatch={patch}
            onClearAll={() => setFilters(DEFAULT_FILTERS)}
          />

          {visible.length ? (
            <>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="text-[17px] font-bold text-ink">Browse</h3>
                  {/* The gate is a one-time door; this is the standing label. */}
                  <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-brand">
                    18+
                  </span>
                </div>
                <p className="text-[13px] font-medium tabular-nums text-muted">
                  {visible.length} {visible.length === 1 ? "post" : "posts"}
                </p>
              </div>

              {/* Two-up on a phone: the tiles are the content, and at 430px
                  two 200px tiles read better than one wide one. */}
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                {visible.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon="SearchX"
              title="No posts match your filters"
              body="Try widening the area or clearing a filter."
              action={<Button onClick={resetAll}>Clear filters</Button>}
            />
          )}
        </div>
      </PageBody>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        listings={personalsListings}
        query={query}
        initialGroup="sort"
        hideCategory
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </>
  );
}
