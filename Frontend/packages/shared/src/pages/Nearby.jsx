"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "../lib/nav";
import { SlidersHorizontal } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import BottomSheet from "../components/ui/BottomSheet";
import SegmentedControl from "../components/ui/SegmentedControl";
import FilterSheet from "../components/FilterSheet";
import FilterChips from "../components/FilterChips";
import NearbyListingCard from "../components/cards/NearbyListingCard";
import PersonCard from "../components/cards/PersonCard";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
} from "../lib/filters";
import { listings, people, personalsListings } from "../data/mock";
import { IS_PERSONALS } from "../lib/sites";

// Leaflet reads `window` while it is being imported, so the map is fetched in
// the browser only; the rest of the screen still renders on the server.
const MapView = dynamic(() => import("../components/MapView.jsx"), {
  ssr: false,
});

const views = [
  { value: "listings", label: "Listings" },
  { value: "people", label: "People" },
];

// Personals is one category of one kind of post, so its map has nothing to
// switch between — the Listings/People split is a marketplace idea.
const FEED = IS_PERSONALS ? personalsListings : listings;

export default function Nearby() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({
    ...DEFAULT_FILTERS,
    sort: "nearest",
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  // ?view=people renders the people feed; the map opens on listings.
  const view = params.get("view") ?? "listings";
  const showPeople = !IS_PERSONALS && view === "people";
  const setView = (next) =>
    setParams(next === "people" ? { view: "people" } : {});

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));
  const nearby = applyFilters(FEED, filters);
  const filterCount = activeFilterCount(filters);

  return (
    <>
      <TopBar title="Nearby" />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <MapView className="h-[46%] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1" />

        <BottomSheet>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[20px] font-extrabold text-ink">
                {showPeople
                  ? "People near you"
                  : IS_PERSONALS
                    ? "Posts near you"
                    : "Listings near you"}
              </h2>
              <p className="text-[13px] text-muted">
                {showPeople
                  ? `${people.length} within 5 km`
                  : `${nearby.length} within 5 km`}
              </p>
            </div>

            {!showPeople && (
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
            )}
          </div>

          {!IS_PERSONALS && (
            <SegmentedControl
              options={views}
              label="Nearby feed"
              value={showPeople ? "people" : "listings"}
              onChange={setView}
              className="mb-4"
            />
          )}

          {showPeople ? (
            <div className="space-y-2.5">
              {people.map((p) => (
                <PersonCard key={p.id} person={p} />
              ))}
            </div>
          ) : (
            <>
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
            </>
          )}
        </BottomSheet>
      </div>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        listings={listings}
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
