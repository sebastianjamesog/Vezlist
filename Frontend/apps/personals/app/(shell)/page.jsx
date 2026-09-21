"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChartNoAxesCombined,
  Clapperboard,
  Eye,
  EyeOff,
  LayoutGrid,
  MapPin,
  Radio,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
} from "lucide-react";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import SearchBar from "@vezlist/shared/components/ui/SearchBar.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import LocationBar from "@vezlist/shared/components/LocationBar.jsx";
import FilterSheet from "@vezlist/shared/components/FilterSheet.jsx";
import FilterButton from "@vezlist/shared/components/FilterButton.jsx";
import PersonalsPicker from "@vezlist/shared/components/PersonalsPicker.jsx";
import { StoryRail } from "@vezlist/shared/components/StatusList.jsx";
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
// The context, the hook and the grouping function all still say "status": the
// label on screen is Stories, the identifiers underneath it are not renamed.
import { useStatus } from "@vezlist/shared/context/StatusContext.jsx";
import { useToast } from "@vezlist/shared/context/ToastContext.jsx";
import { usePromote } from "@vezlist/shared/lib/usePromote.js";
import { groupStatuses } from "@vezlist/shared/lib/status.js";
import { DEFAULT_FILTERS, activeFilterCount } from "@vezlist/shared/lib/filters.js";
import { searchListings } from "@vezlist/shared/lib/api/discovery.js";
import { SITE_SCOPE } from "@vezlist/shared/lib/api/client.js";
import { liveStreams } from "@vezlist/shared/data/mock.js";
import ListingCard from "@vezlist/shared/components/cards/ListingCard.jsx";
import { Promos, Shortcuts } from "@vezlist/shared/components/FeedRails.jsx";
import { useDiscreet } from "../useDiscreet";

/**
 * The home screen of personals.vezlist.cc — now reading its board from
 * GET /api/v1/listings?site=PERSONALS (cc.vezlist.discovery.web.
 * DiscoveryController) instead of the mock's `personalsListings`.
 *
 * Two of this board's own facets have nothing to send the server: "who is
 * posting" (ethnicity) and "what a post is for" beyond the one Personals
 * category, plus "available now", all lived only in the mock's rows.
 * `DiscoverySearchRequest` has no field for any of the three, so
 * `PersonalsPicker` and the sheet's "Available now" switch still work as
 * *local* filter state — they patch `filters`, which is real state — but
 * nothing here sends them on to the search request, because the server has
 * nothing to match them against. What does reach the server: free text,
 * province/area, verified-only, posted-within and sort.
 */
const POSTED_WITHIN_TO_API = { "24h": "HOURS_24", "7d": "DAYS_7", "30d": "DAYS_30" };
const SORT_TO_API = {
  newest: "NEWEST",
  "price-asc": "PRICE_ASC",
  "price-desc": "PRICE_DESC",
  nearest: "NEAREST",
};
const PAGE_SIZE = 20;

function areaIdForLabel(locations, label) {
  if (!locations) return null;
  for (const province of locations.provinces ?? []) {
    const hit = (province.areas ?? []).find((a) => a.label === label);
    if (hit) return hit.id;
  }
  return null;
}

function buildDiscoveryParams(filters, query, locations, cursor) {
  const params = {
    site: SITE_SCOPE,
    q: query.trim() || undefined,
    sort: SORT_TO_API[filters.sort],
    verifiedOnly: filters.verifiedOnly || undefined,
    postedWithin: POSTED_WITHIN_TO_API[filters.postedWithin],
    province: filters.province !== "all" ? filters.province : undefined,
    limit: PAGE_SIZE,
    cursor,
  };
  if (filters.cities.length) {
    const ids = filters.cities
      .map((label) => areaIdForLabel(locations, label))
      .filter(Boolean);
    if (ids.length) params.area = ids;
  }
  return params;
}

function toCardListing(row) {
  return {
    id: row.id,
    title: row.title,
    business: row.businessName,
    category: row.categoryLabel,
    province: row.provinceLabel,
    location: row.locationLabel,
    price: Number(row.price ?? 0),
    verified: row.verified,
    postedMsAgo: row.publishedAt
      ? Date.now() - new Date(row.publishedAt).getTime()
      : null,
    image: row.imageUrl,
  };
}

function PickerButton({ Icon, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold shadow-card transition-transform hover:-translate-y-0.5 active:scale-95 ${
        count ? "bg-brand text-on-brand" : "bg-surface text-ink"
      }`}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2.4} />
      {label}
      {count > 0 && (
        <span className="grid size-[18px] place-items-center rounded-full bg-on-brand/25 text-[11px] tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Five ways into the board. Unlike the mock-era rail, none of these carries
 * a live count or a face stack any more — both were measured off the full
 * mock `personalsListings` array at module scope, and there is nothing
 * equivalent to measure a real backend against without either a dedicated
 * counting endpoint (none exists) or several extra search requests just to
 * fill a rail. What is left is what each tile actually does.
 */
const SHORTCUTS = [
  {
    id: "live",
    label: "Live Now",
    sub: `${liveStreams.length} live`,
    Icon: Radio,
    href: "/live",
    accent: "rose",
  },
  {
    id: "nearby",
    label: "Nearby Map",
    sub: "Find nearby",
    Icon: MapPin,
    href: "/nearby",
    accent: "brand",
  },
  {
    id: "available",
    label: "Available Now",
    sub: "On this device only",
    dot: true,
    patch: { availableOnly: true },
    accent: "green",
  },
  {
    id: "trending",
    label: "Trending",
    sub: "This week",
    Icon: ChartNoAxesCombined,
    patch: { postedWithin: "7d", sort: "newest" },
    accent: "purple",
  },
  {
    id: "new",
    label: "New Today",
    sub: "Last 24 hours",
    Icon: Sparkles,
    patch: { postedWithin: "24h", sort: "newest" },
    accent: "amber",
    pill: "NEW",
  },
];

export default function Personals() {
  const { filters, setFilters, query, setQuery, locations } = useFeed();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState(null);
  const [discreet, setDiscreet] = useDiscreet();
  const { seen, stories } = useStatus();
  const toast = useToast();
  const promote = usePromote();

  const { recent, viewed } = groupStatuses(stories, seen);
  const shownStatuses = [...recent, ...viewed];

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));
  const filterCount = activeFilterCount(filters);

  function resetAll() {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  }

  /* --------------------------------------------------------- the feed --- */
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchListings(buildDiscoveryParams(filters, query, locations))
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
  }, [filters, query, locations, reloadToken]);

  function loadMore() {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    searchListings(buildDiscoveryParams(filters, query, locations, nextCursor))
      .then((res) => {
        setItems((prev) => [...prev, ...(res?.items ?? [])]);
        setNextCursor(res?.nextCursor ?? null);
        setHasMore(!!res?.hasMore);
      })
      .catch(() => setError((e) => e ?? new Error("Couldn't load more posts")))
      .finally(() => setLoadingMore(false));
  }

  const cards = useMemo(() => items.map(toCardListing), [items]);

  return (
    <>
      <PageBody className="px-4 pb-8 lg:px-8">
        <div className="pb-3 pt-3 lg:pt-4">
          <div className="flex gap-2.5">
            <SearchBar
              className="min-w-0 flex-1"
              placeholder="Search personals…"
              value={query}
              onChange={setQuery}
            />

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

          <Shortcuts
            items={SHORTCUTS}
            filters={filters}
            onPatch={patch}
            className="mt-3"
          />
        </div>

        {shownStatuses.length > 0 && (
          <section className="pt-1">
            <h2 className="pb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
              Stories
              {recent.length ? ` · ${recent.length} new` : ""}
            </h2>

            <StoryRail stories={shownStatuses} seen={seen} />
          </section>
        )}

        <div className="pt-3">
          <div className="mb-3">
            <h3 className="text-[17px] font-bold leading-tight text-ink">
              Browse
            </h3>

            <div className="no-scrollbar -mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              <PickerButton
                Icon={LayoutGrid}
                label="Category"
                count={filters.personalsCategories.length}
                onClick={() => setPickerTab("category")}
              />
              <PickerButton
                Icon={UsersRound}
                label="Ethnicity"
                count={filters.ethnicities.length}
                onClick={() => setPickerTab("ethnicity")}
              />
              <FilterButton
                className="ml-auto"
                filters={filters}
                onClick={() => setSheetOpen(true)}
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[122px] animate-pulse rounded-2xl bg-surface shadow-card lg:h-[136px]"
                />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon="TriangleAlert"
              title="Couldn't load posts"
              body={error.message || "Something went wrong. Please try again."}
              action={
                <Button onClick={() => setReloadToken((t) => t + 1)}>
                  Retry
                </Button>
              }
            />
          ) : cards.length ? (
            <>
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                {cards.map((l) => (
                  <ListingCard key={l.id} listing={l} chevron />
                ))}
              </div>
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon="SearchX"
              title="No posts match your filters"
              body="Try widening the area or clearing a filter."
              action={<Button onClick={resetAll}>Clear filters</Button>}
            />
          )}

          <Promos
            className="mt-3"
            cards={[
              {
                id: "boost",
                Icon: Rocket,
                iconClass: "text-brand",
                title: "Smart Boost",
                sub: "Get more views",
                cta: "Boost Now",
                ctaClass: "brand-gradient text-on-brand",
                onClick: promote,
              },
              {
                id: "clips",
                Icon: Clapperboard,
                iconClass: "text-brand-2",
                title: "Auto-Clips",
                sub: "New clips from creators",
                cta: "Watch Clips",
                ctaClass: "bg-brand-strong text-white",
                onClick: () => toast("Clips are not wired up yet"),
                thumbs: shownStatuses.map((s) => s.avatar),
              },
            ]}
          />
        </div>
      </PageBody>

      <PersonalsPicker
        open={pickerTab !== null}
        initialTab={pickerTab ?? "category"}
        filters={filters}
        listings={cards}
        query={query}
        onClose={() => setPickerTab(null)}
        onApply={(next) => {
          setFilters(next);
          setPickerTab(null);
        }}
      />

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        listings={cards}
        query={query}
        initialGroup="sort"
        personals
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </>
  );
}
