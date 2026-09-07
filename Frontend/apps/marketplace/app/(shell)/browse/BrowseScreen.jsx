"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "@vezlist/shared/lib/nav.jsx";
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
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
import { useCatalog } from "@vezlist/shared/context/CatalogContext.jsx";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
} from "@vezlist/shared/lib/filters.js";
import { listings } from "@vezlist/shared/data/mock.js";

/**
 * The feed. Home is the category launcher; this is where a chosen category
 * lands, so it opens on whatever ?cat= the tile carried in.
 *
 * Personals is not a category here — it is its own site, reached from the
 * strip's Personals tile.
 */
export default function BrowseScreen() {
  // Filters live above the routes: the status player unmounts this screen.
  const { filters, setFilters, query, setQuery } = useFeed();
  const { categories } = useCatalog();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetGroup, setSheetGroup] = useState("sort");
  const [params] = useSearchParams();
  const catParam = params.get("cat");

  // ponytail: ?cat= is an entry parameter, not a mirror of the filter. Picking
  // a different category in the strip leaves the URL behind rather than
  // rewriting it — a two-way sync buys nothing here and fights itself.
  useEffect(() => {
    const label = categories.find((c) => c.id === catParam)?.label;
    setFilters((f) => (label ? { ...f, categories: [label] } : f));
  }, [catParam, categories, setFilters]);

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));
  // The category strip and the sheet's Category group are the same state.
  const activeCategory =
    filters.categories.length === 1 ? filters.categories[0] : null;
  const activeCategoryId =
    categories.find((c) => c.label === activeCategory)?.id ?? "";

  function openSheet(group = "sort") {
    setSheetGroup(group);
    setSheetOpen(true);
  }

  function pickCategory(id) {
    if (id === "more") return openSheet("category");
    const label = categories.find((c) => c.id === id)?.label;
    if (activeCategory === label) return resetAll();
    patch({ categories: [label] });
  }

  function resetAll() {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  }

  const visible = applyFilters(listings, filters, query);
  const filterCount = activeFilterCount(filters);

  return (
    <>
      <TopBar title={activeCategory ? `${activeCategory} ads` : "Browse ads"} />

      <PageBody className="px-4 pb-8 lg:px-8">
        {/* Hero: search, then the place it searches in. */}
        <div className="pb-3 pt-1 lg:pt-4">
          <div className="flex gap-2.5">
            <SearchBar
              className="flex-1"
              placeholder="Search ads, sellers, places…"
              value={query}
              onChange={setQuery}
            />

            <button
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

          {visible.length ? (
            <>
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-[17px] font-bold text-ink">
                  {activeCategory ?? "Latest ads"}
                </h3>
                <p className="text-[13px] font-medium text-muted">
                  {visible.length} {visible.length === 1 ? "result" : "results"}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                {visible.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon="SearchX"
              title="No ads match your filters"
              body="Try widening the price range or clearing a filter."
              action={<Button onClick={resetAll}>Clear filters</Button>}
            />
          )}
        </div>
      </PageBody>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        listings={listings}
        query={query}
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
