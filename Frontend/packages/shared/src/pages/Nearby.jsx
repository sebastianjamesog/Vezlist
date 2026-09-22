"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { SlidersHorizontal } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import BottomSheet from "../components/ui/BottomSheet";
import FilterSheet from "../components/FilterSheet";
import FilterChips from "../components/FilterChips";
import Button from "../components/ui/Button";
import NearbyListingCard from "../components/cards/NearbyListingCard";
import { DEFAULT_FILTERS, activeFilterCount } from "../lib/filters";
import { searchListings } from "../lib/api/discovery.js";
import { SITE_SCOPE, ApiError } from "../lib/api/client.js";
import { categoryByLabel } from "../lib/taxonomy.js";
import { IS_PERSONALS } from "../lib/sites";

// Leaflet reads `window` while it is being imported, so the map is fetched in
// the browser only; the rest of the screen still renders on the server.
const MapView = dynamic(() => import("../components/MapView.jsx"), {
  ssr: false,
});

/** The three distances a reader can actually pick — see `RADIUS_OPTIONS`
 * below for why this stops at 15 rather than the backend's 100km ceiling. */
const DEFAULT_RADIUS_KM = 5;
const RADIUS_OPTIONS = [5, 10, 15];

const PAGE_SIZE = 24;

/**
 * `DiscoverySearchRequest` needs `SORT_TO_API`'s NEAREST spelling plus a
 * real coordinate — everything else (category id, verifiedOnly, the
 * postedWithin enum name) is the same mapping `BrowseScreen` already
 * established, kept in sync with it deliberately rather than shared,
 * because the two screens' surrounding logic (query string vs. geolocation)
 * has nothing else in common to factor out around.
 */
const POSTED_WITHIN_TO_API = { "24h": "HOURS_24", "7d": "DAYS_7", "30d": "DAYS_30" };

function buildNearbyParams(filters, coords, radiusKm, cursor) {
  const params = {
    site: SITE_SCOPE,
    sort: "NEAREST",
    latitude: coords.lat,
    longitude: coords.lng,
    radiusKm,
    verifiedOnly: filters.verifiedOnly || undefined,
    postedWithin: POSTED_WITHIN_TO_API[filters.postedWithin],
    limit: PAGE_SIZE,
    cursor,
  };
  if (filters.categories.length) {
    const ids = filters.categories.map((label) => categoryByLabel(label)?.id).filter(Boolean);
    if (ids.length) params.category = ids;
  }
  return params;
}

/** A `DiscoveryListingResponse` row, shaped for `NearbyListingCard` and for
 * `MapView`'s real pins — both read straight off this, no re-fetch. */
function toCardListing(row) {
  return {
    id: row.id,
    adId: row.id,
    title: row.title,
    category: row.categoryLabel,
    price: Number(row.price ?? 0),
    verified: row.verified,
    distanceKm: row.distanceKm ?? 0,
    postedMsAgo: row.publishedAt ? Date.now() - new Date(row.publishedAt).getTime() : null,
    image: row.imageUrl,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

/**
 * One feed, on both boards, now backed by the real distance search
 * (`DiscoverySearchRequest` with `sort=NEAREST` + a coordinate + a radius)
 * instead of the mock board's invented `distanceKm`.
 *
 * "Nearby" only means something once the browser has said where "here" is,
 * so this screen's first job — before any listing, any filter, any map pin
 * — is asking for that. Everything below is gated on having it.
 */
export default function Nearby() {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, sort: "nearest" });
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const collapse = useCallback(() => setCollapsed(true), []);

  /* ------------------------------------------------------------ location */
  const [coords, setCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState("locating"); // locating | ready | denied | unsupported | error
  const [geoRetryToken, setGeoRetryToken] = useState(0);
  const retryLocation = () => {
    setGeoStatus("locating");
    setGeoRetryToken((n) => n + 1);
  };

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoStatus("ready");
      },
      (error) => {
        setGeoStatus(error.code === error.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 10_000 },
    );
  }, [geoRetryToken]);

  /* ------------------------------------------------------------- results */
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!coords) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchListings(buildNearbyParams(filters, coords, radiusKm))
      .then((res) => {
        if (cancelled) return;
        setItems(res?.items ?? []);
        setNextCursor(res?.nextCursor ?? null);
        setHasMore(!!res?.hasMore);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, radiusKm, filters, reloadToken]);

  function loadMore() {
    if (!hasMore || loadingMore || !nextCursor || !coords) return;
    setLoadingMore(true);
    searchListings(buildNearbyParams(filters, coords, radiusKm, nextCursor))
      .then((res) => {
        setItems((prev) => [...prev, ...(res?.items ?? [])]);
        setNextCursor(res?.nextCursor ?? null);
        setHasMore(!!res?.hasMore);
      })
      .catch(() => setError((e) => e ?? new Error("Couldn't load more ads")))
      .finally(() => setLoadingMore(false));
  }

  const cards = useMemo(() => items.map(toCardListing), [items]);
  const filterCount = activeFilterCount(filters);
  const patch = (next) => setFilters((f) => ({ ...f, ...next }));

  const center = coords ? [coords.lat, coords.lng] : undefined;

  return (
    <>
      <TopBar title="Nearby" />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* The map plots the filtered set, not the whole board — a pin the list
            underneath has just filtered away is a pin that lies. */}
        <MapView
          items={cards}
          center={center}
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
                  {geoStatus === "ready"
                    ? `${cards.length} within ${radiusKm} km`
                    : "Finding your location…"}
                </p>
              </div>

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
          {/* Radius, front and centre: it is the one control specific to this
              screen, so it sits above the filters everything else already
              offers rather than buried a tap away inside the sheet. Capped at
              15km rather than the backend's 100km ceiling — "nearby" stops
              meaning anything past a short drive, and a wider net belongs to
              Browse's ordinary location filter, not this one. */}
          <div
            role="radiogroup"
            aria-label="Search radius"
            className="mb-3 flex gap-2"
          >
            {RADIUS_OPTIONS.map((km) => (
              <button
                key={km}
                type="button"
                role="radio"
                aria-checked={radiusKm === km}
                onClick={() => setRadiusKm(km)}
                className={`flex-1 rounded-2xl border py-2 text-[13.5px] font-bold transition-colors ${
                  radiusKm === km
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {km} km
              </button>
            ))}
          </div>

          <FilterChips
            filters={filters}
            onPatch={patch}
            onClearAll={() => setFilters({ ...DEFAULT_FILTERS, sort: "nearest" })}
          />

          {geoStatus === "denied" || geoStatus === "unsupported" || geoStatus === "error" ? (
            <div className="rounded-card bg-surface py-10 text-center shadow-card">
              <p className="text-[15px] font-bold text-ink">
                {geoStatus === "denied"
                  ? "Location access is off"
                  : geoStatus === "unsupported"
                    ? "This browser can't share your location"
                    : "Couldn't get your location"}
              </p>
              <p className="mx-auto mt-1.5 max-w-[26rem] text-[13.5px] text-muted">
                {geoStatus === "denied"
                  ? "Turn on location for this site to see what's nearby, or browse everything instead."
                  : "Try again, or browse everything instead."}
              </p>
              {geoStatus === "error" && (
                <Button className="mt-4" onClick={retryLocation}>
                  Try again
                </Button>
              )}
            </div>
          ) : loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-card bg-surface shadow-card" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-card bg-surface py-10 text-center shadow-card">
              <p className="text-[15px] font-bold text-ink">Couldn't load nearby ads</p>
              <p className="mt-1.5 text-[13.5px] text-muted">
                {error instanceof ApiError ? error.message : "Something went wrong."}
              </p>
              <Button className="mt-4" onClick={() => setReloadToken((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : cards.length ? (
            <div className="space-y-2.5">
              {cards.map((item) => (
                <NearbyListingCard key={item.id} item={item} />
              ))}
              {hasMore && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={loadMore}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              )}
            </div>
          ) : (
            <p className="rounded-card bg-surface py-12 text-center text-[15px] text-muted shadow-card">
              Nothing within {radiusKm} km matches these filters.
            </p>
          )}
        </BottomSheet>
      </div>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        listings={cards}
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
