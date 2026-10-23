"use client";

import { useMemo, useState } from "react";
import {
  ChartNoAxesCombined,
  LayoutGrid,
  MapPin,
  Radio,
  Sparkles,
  UsersRound,
} from "lucide-react";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import SearchBar from "@vezlist/shared/components/ui/SearchBar.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import LocationBar from "@vezlist/shared/components/LocationBar.jsx";
import FilterSheet from "@vezlist/shared/components/FilterSheet.jsx";
import { provinceLabel, resolveLocationIds } from "@vezlist/shared/lib/locationCatalog.js";
import FilterChips from "@vezlist/shared/components/FilterChips.jsx";
import FilterButton from "@vezlist/shared/components/FilterButton.jsx";
import PersonalsPicker from "@vezlist/shared/components/PersonalsPicker.jsx";
import { StoryRail } from "@vezlist/shared/components/StatusList.jsx";
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
// The context, the hook and the grouping function all still say "status": the
// label on screen is Stories, the identifiers underneath it are not renamed.
import { useStatus } from "@vezlist/shared/context/StatusContext.jsx";
import { groupStatuses } from "@vezlist/shared/lib/status.js";
import { categoryByLabel } from "@vezlist/shared/lib/taxonomy.js";
import { DEFAULT_FILTERS } from "@vezlist/shared/lib/filters.js";
import useBrowseResults from "@vezlist/shared/hooks/useBrowseResults.js";
import { SITE_SCOPE } from "@vezlist/shared/lib/api/client.js";
import ListingCard from "@vezlist/shared/components/cards/ListingCard.jsx";
import { Shortcuts } from "@vezlist/shared/components/FeedRails.jsx";
import { useDiscreet } from "../useDiscreet";
import ChoiceRow from "@vezlist/shared/components/ui/ChoiceRow.jsx";
import useShortcutPreviews from "../useShortcutPreviews.js";

/** Search the full Personals board, narrowed only by selected filters. */
const POSTED_WITHIN_TO_API = { "24h": "HOURS_24", "7d": "DAYS_7", "30d": "DAYS_30" };
const SORT_TO_API = {
  newest: "NEWEST",
  "verified-first": "VERIFIED_FIRST",
  "price-asc": "PRICE_ASC",
  "price-desc": "PRICE_DESC",
  nearest: "NEAREST",
};
const PAGE_SIZE = 20;

function buildDiscoveryParams(filters, query, locations, cursor) {
  const params = {
    site: SITE_SCOPE,
    q: query.trim() || undefined,
    sort: SORT_TO_API[filters.sort],
    minPrice: filters.minPrice || undefined,
    maxPrice: filters.maxPrice || undefined,
    verifiedOnly: filters.verifiedOnly || undefined,
    availableOnly: filters.availableOnly || undefined,
    ethnicities: filters.ethnicities.length ? filters.ethnicities : undefined,
    postedWithin: POSTED_WITHIN_TO_API[filters.postedWithin],
    province: filters.province !== "all" ? filters.province : undefined,
    limit: PAGE_SIZE,
    cursor,
  };
  if (filters.categories.length) {
    params.category = filters.categories.map((label) => categoryByLabel(label)?.id).filter(Boolean);
  }
  if (filters.cities.length) params.area = resolveLocationIds(locations, filters);
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
    views: row.viewCount,
    site: row.site,
    verified: row.verified,
    publishedAt: row.publishedAt,
    availableNow: row.availableNow,
    availableUntil: row.availableUntil,
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

/** Shortcut previews use the same backend feeds as their destinations. */
const SHORTCUTS = [
  {
    id: "live",
    label: "Live Now",
    sub: "See who's active",
    Icon: Radio,
    href: "/live",
    accent: "rose",
  },
  {
    id: "trending",
    label: "Trending",
    sub: "Recent engagement",
    Icon: ChartNoAxesCombined,
    href: "/trending",
    accent: "purple",
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
    sub: "Creators available now",
    dot: true,
    href: "/featured/available",
    accent: "green",
  },
  {
    id: "new",
    label: "New Today",
    sub: "Last 24 hours",
    Icon: Sparkles,
    href: "/featured/new",
    accent: "amber",
    pill: "NEW",
  },
];

export default function Personals() {
  const { filters, setFilters, query, setQuery, locations, browseCache } = useFeed();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState(null);
  const [discreet, setDiscreet] = useDiscreet();
  const { seen, stories } = useStatus();

  const { mine, recent, viewed } = groupStatuses(stories, seen);
  const shownStatuses = [...(mine?.updates.length ? [mine] : []), ...recent, ...viewed];

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));

  function resetAll() {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  }

  /* --------------------------------------------------------- the feed --- */
  const { items, hasMore, loading, loadingMore, error, loadMore, retry, scroll } =
    useBrowseResults(buildDiscoveryParams(filters, query, locations), browseCache);
  const previews = useShortcutPreviews();

  const cards = useMemo(() => items.map(toCardListing), [items]);

  return (
    <>
      <PageBody scrollMemory={scroll} className="px-4 pb-8 lg:px-8">
        <div className="pt-3 lg:pt-4">
          <div className="flex gap-2.5">
            <SearchBar
              className="min-w-0 flex-1"
              placeholder="Search personals…"
              value={query}
              onChange={setQuery}
            />

          </div>

          <LocationBar
            filters={filters}
            onPatch={patch}
            className="mt-2.5 min-w-0"
          />

          <Shortcuts
            items={SHORTCUTS.map((shortcut) => ({ ...shortcut, ...previews[shortcut.id] }))}
            filters={filters}
            onPatch={patch}
            className="mt-3"
          />
        </div>

        {shownStatuses.length > 0 && (
          <section className="pt-3">
            <h2 className="pb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
              Stories
              {recent.length ? ` · ${recent.length} new` : ""}
            </h2>

            <StoryRail stories={shownStatuses} seen={seen} />
          </section>
        )}

        <div className={shownStatuses.length > 0 ? "pt-3" : "pt-2"}>
          <div className="mb-3">
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              <PickerButton
                Icon={LayoutGrid}
                label={filters.categories.length ? "Category" : "All categories"}
                count={filters.categories.length}
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

          <p className="mb-3 text-[13px] text-muted">
            {filters.categories.length || filters.personalsCategories.length ? "Selected categories" : "All categories"}
            {" \u00b7 "}{provinceLabel(filters.province, locations)}
          </p>
          <FilterChips filters={filters} onPatch={patch} onClearAll={resetAll}
            query={query} onClearQuery={() => setQuery("")} />

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
                <Button onClick={retry}>
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
        displayOptions={
          <ChoiceRow type="checkbox" checked={discreet} onChange={() => setDiscreet((value) => !value)}>
            Hide photos (discreet mode)
          </ChoiceRow>
        }
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
