"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import TopBar from "@vezlist/shared/components/layout/TopBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import SearchBar from "@vezlist/shared/components/ui/SearchBar.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import CategoryStrip from "@vezlist/shared/components/CategoryStrip.jsx";
import LocationBar from "@vezlist/shared/components/LocationBar.jsx";
import FilterSheet from "@vezlist/shared/components/FilterSheet.jsx";
import FilterChips from "@vezlist/shared/components/FilterChips.jsx";
import ListingCard from "@vezlist/shared/components/cards/ListingCard.jsx";
import { useCatalog } from "@vezlist/shared/context/CatalogContext.jsx";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
} from "@vezlist/shared/lib/filters.js";
import {
  useDiscovery,
  useDiscoveryUrlState,
} from "@vezlist/shared/lib/useDiscovery.js";

/** Public marketplace discovery. Filters are shareable URL state; cards come from the API. */
export default function BrowseScreen() {
  const catalog = useCatalog();
  const { categories } = catalog;
  const { filters, setFilters, query, setQuery, reset } = useDiscoveryUrlState({
    catalog,
  });
  const {
    items: visible,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    retry,
  } = useDiscovery({
    site: "MARKETPLACE",
    filters,
    query,
    catalog,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetGroup, setSheetGroup] = useState("sort");

  const patch = (next) => setFilters((current) => ({ ...current, ...next }));
  const activeCategory =
    filters.categories.length === 1 ? filters.categories[0] : null;
  const activeCategoryId =
    categories.find((category) => category.label === activeCategory)?.id ?? "";
  const filterCount = activeFilterCount(filters);

  function openSheet(group = "sort") {
    setSheetGroup(group);
    setSheetOpen(true);
  }

  function pickCategory(id) {
    if (id === "more") return openSheet("category");
    const label = categories.find((category) => category.id === id)?.label;
    if (!label) return;
    if (activeCategory === label) return reset();
    patch({ categories: [label] });
  }

  return (
    <>
      <TopBar title={activeCategory ? `${activeCategory} ads` : "Browse ads"} />

      <PageBody className="px-4 pb-8 lg:px-8">
        <div className="pb-3 pt-1 lg:pt-4">
          <div className="flex gap-2.5">
            <SearchBar
              className="flex-1"
              placeholder="Search ads, sellers, places..."
              value={query}
              onChange={setQuery}
            />

            <button
              type="button"
              onClick={() => openSheet()}
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

          <div className="mt-2.5">
            <LocationBar
              filters={filters}
              onPatch={patch}
              className="min-w-0"
            />
          </div>
        </div>

        <CategoryStrip value={activeCategoryId} onChange={pickCategory} />

        <div className="pt-3">
          <FilterChips
            filters={filters}
            onPatch={patch}
            onClearAll={() => setFilters(DEFAULT_FILTERS)}
          />

          {loading ? (
            <p className="rounded-card bg-surface py-12 text-center text-[15px] text-muted shadow-card">
              Loading ads...
            </p>
          ) : error && !visible.length ? (
            <EmptyState
              icon="WifiOff"
              title="Could not load ads"
              body={error.message}
              action={<Button onClick={retry}>Try again</Button>}
            />
          ) : visible.length ? (
            <>
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-[17px] font-bold text-ink">
                  {activeCategory ?? "Latest ads"}
                </h3>
                <p className="text-[13px] font-medium text-muted">
                  {visible.length}
                  {hasMore ? "+" : ""} loaded
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                {visible.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-5 flex justify-center">
                  <Button onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon="SearchX"
              title="No ads match your filters"
              body="Try widening the price range or clearing a filter."
              action={<Button onClick={reset}>Clear filters</Button>}
            />
          )}
        </div>
      </PageBody>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        initialGroup={sheetGroup}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </>
  );
}
