"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "../lib/nav";
import TopBar from "../components/layout/TopBar";
import BottomSheet from "../components/ui/BottomSheet";
import SegmentedControl from "../components/ui/SegmentedControl";
import Button from "../components/ui/Button";
import FilterSheet from "../components/FilterSheet";
import FilterChips from "../components/FilterChips";
import NearbyListingCard from "../components/cards/NearbyListingCard";
import PersonCard from "../components/cards/PersonCard";
import { DEFAULT_FILTERS, activeFilterCount } from "../lib/filters";
import { people } from "../data/mock";
import { useCatalog } from "../context/CatalogContext";
import {
  useDiscovery,
  useDiscoveryMap,
  useDiscoveryUrlState,
} from "../lib/useDiscovery";
import { IS_PERSONALS } from "../lib/sites";

const MapView = dynamic(() => import("../components/MapView.jsx"), {
  ssr: false,
});

const views = [
  { value: "listings", label: "Listings" },
  { value: "people", label: "People" },
];
const DEFAULT_COORDINATES = {
  latitude: 48.4284,
  longitude: -123.3656,
  radiusKm: 5,
};
const PRESERVE_VIEW = ["view"];

export default function Nearby() {
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const { filters, setFilters, query, setQuery } = useDiscoveryUrlState({
    catalog,
    defaultSort: "nearest",
    allowNearest: true,
    preserveKeys: PRESERVE_VIEW,
  });
  const [coordinates, setCoordinates] = useState(DEFAULT_COORDINATES);
  const [sheetOpen, setSheetOpen] = useState(false);
  const fixedCategoryIds = IS_PERSONALS ? ["personals"] : [];
  const {
    items: nearby,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    retry,
  } = useDiscovery({
    site: IS_PERSONALS ? "PERSONALS" : "MARKETPLACE",
    filters,
    query,
    catalog,
    coordinates,
    fixedCategoryIds,
    limit: 24,
  });
  const pins = useDiscoveryMap({
    site: IS_PERSONALS ? "PERSONALS" : "MARKETPLACE",
    filters,
    query,
    catalog,
    coordinates,
    fixedCategoryIds,
  });

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
          radiusKm: 5,
        }),
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const view = params.get("view") ?? "listings";
  const showPeople = !IS_PERSONALS && view === "people";
  const setView = (next) => {
    const updated = new URLSearchParams(params);
    if (next === "people") updated.set("view", "people");
    else updated.delete("view");
    setParams(updated);
  };
  const patch = (next) => setFilters((current) => ({ ...current, ...next }));
  const filterCount = activeFilterCount(filters);

  return (
    <>
      <TopBar title="Nearby" />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <MapView
          className="h-[46%] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1"
          center={[coordinates.latitude, coordinates.longitude]}
          pins={pins}
          query={query}
          onQueryChange={setQuery}
          onLocate={locate}
        />

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
                  : `${nearby.length}${hasMore ? "+" : ""} within 5 km`}
              </p>
            </div>

            {!showPeople && (
              <button
                type="button"
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
              {people.map((person) => (
                <PersonCard key={person.id} person={person} />
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
              {loading ? (
                <p className="rounded-card bg-surface py-12 text-center text-[15px] text-muted shadow-card">
                  Finding listings near you...
                </p>
              ) : error && !nearby.length ? (
                <div className="rounded-card bg-surface p-6 text-center shadow-card">
                  <p className="text-[15px] font-semibold text-ink">
                    Could not load nearby listings
                  </p>
                  <p className="mt-1 text-[13px] text-muted">{error.message}</p>
                  <Button className="mt-4" onClick={retry}>
                    Try again
                  </Button>
                </div>
              ) : nearby.length ? (
                <div className="space-y-2.5">
                  {nearby.map((item) => (
                    <NearbyListingCard key={item.id} item={item} />
                  ))}
                  {hasMore && (
                    <Button
                      className="w-full"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "Loading..." : "Load more"}
                    </Button>
                  )}
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
        allowNearest
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </>
  );
}
