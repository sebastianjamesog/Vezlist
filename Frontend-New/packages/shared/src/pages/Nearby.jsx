"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { SlidersHorizontal } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import BottomSheet from "../components/ui/BottomSheet";
import FilterSheet from "../components/FilterSheet";
import FilterChips from "../components/FilterChips";
import NearbyListingCard from "../components/cards/NearbyListingCard";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
} from "../lib/filters";
import { useReports } from "../context/ReportsContext";
import { hideBlocked } from "../lib/reports";
import { listings, personalsListings } from "../data/mock";
import { IS_PERSONALS } from "../lib/sites";

// Leaflet reads `window` while it is being imported, so the map is fetched in
// the browser only; the rest of the screen still renders on the server.
const MapView = dynamic(() => import("../components/MapView.jsx"), {
  ssr: false,
});

/**
 * One feed, on both boards.
 *
 * This screen used to carry a Listings/People switch on the marketplace, with
 * `?view=people` swapping the sheet for a list of profiles. It is gone: people
 * are what the personals board is for, and putting a handful of them behind a
 * tab on the marketplace made the map look like it plotted two different kinds
 * of thing when it only ever plotted one. Nearby now means "ads near you" on
 * both sites, and the only thing that changes across them is the noun.
 */
const FEED = IS_PERSONALS ? personalsListings : listings;

export default function Nearby() {
  const [filters, setFilters] = useState({
    ...DEFAULT_FILTERS,
    sort: "nearest",
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  // The sheet takes a bit over half the screen at 430px, which leaves the map
  // too short to pan around in. Tapping the map folds the list down to its
  // heading and gives the rest of the height back; the grab handle brings it
  // up again. It opens expanded, because the list is the part that works
  // without tiles, a mouse or good eyesight.
  const [collapsed, setCollapsed] = useState(false);
  const { blocked } = useReports();

  // Stable, or `MapView` would tear down and re-add its listener every render.
  const collapse = useCallback(() => setCollapsed(true), []);

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));
  // Blocked sellers come out here too (#4), and it matters more on this screen
  // than on the feed: the map plots what the list holds, so a row that escaped
  // the block would put the blocked seller back on the reader's screen as a
  // pin they cannot filter away.
  const nearby = hideBlocked(applyFilters(FEED, filters), blocked);
  const filterCount = activeFilterCount(filters);

  return (
    <>
      <TopBar title="Nearby" />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* The map plots the filtered set, not the whole board — a pin the list
            underneath has just filtered away is a pin that lies. */}
        <MapView
          items={nearby}
          onTap={collapse}
          className={`${
            collapsed ? "min-h-0 flex-1" : "h-[46%] shrink-0"
          } lg:h-auto lg:min-h-0 lg:flex-1`}
        />

        <BottomSheet
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          header={
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[20px] font-extrabold text-ink">
                  {IS_PERSONALS ? "Posts near you" : "Listings near you"}
                </h2>
                {/* Stays visible when the list is folded away: it is the one
                    line that says the map is showing a filtered set. */}
                <p className="text-[13px] text-muted">
                  {nearby.length} within 5 km
                </p>
              </div>

              {/* Always present now. It used to disappear whenever the People
                  tab was open, because nothing on that tab was filterable. */}
              <button
                onClick={() => setSheetOpen(true)}
                aria-label="Filters"
                className="relative grid size-11 shrink-0 place-items-center rounded-card bg-surface text-ink shadow-card transition-transform active:scale-95"
              >
                <SlidersHorizontal className="size-[18px]" strokeWidth={2.2} />
                {filterCount > 0 && (
                  <span className="brand-gradient absolute -right-1 -top-1 grid size-5 place-items-center rounded-full text-[11px] font-bold text-on-brand ring-2 ring-canvas lg:ring-surface">
                    {filterCount}
                  </span>
                )}
              </button>
            </div>
          }
        >
          <FilterChips
            filters={filters}
            onPatch={patch}
            onClearAll={() =>
              setFilters({ ...DEFAULT_FILTERS, sort: "nearest" })
            }
          />

          {nearby.length ? (
            <div className="space-y-2.5">
              {nearby.map((item) => (
                <NearbyListingCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="rounded-card bg-surface py-12 text-center text-[15px] text-muted shadow-card">
              Nothing nearby matches these filters.
            </p>
          )}
        </BottomSheet>
      </div>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        // The sheet counts the results a draft would produce, so it has to be
        // handed the same feed this screen filters. It was passed the
        // marketplace `listings` unconditionally, which meant the personals
        // build previewed a count drawn from ads it does not carry.
        listings={FEED}
        query=""
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </>
  );
}
