"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Bookmark,
  BookmarkPlus,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "@vezlist/shared/lib/nav.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import SearchBar from "@vezlist/shared/components/ui/SearchBar.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Modal from "@vezlist/shared/components/ui/Modal.jsx";
import Field, {
  FIELD,
  border,
} from "@vezlist/shared/components/create/Field.jsx";
import LocationBar from "@vezlist/shared/components/LocationBar.jsx";
import FilterSheet from "@vezlist/shared/components/FilterSheet.jsx";
import FilterButton from "@vezlist/shared/components/FilterButton.jsx";
import ListingCard from "@vezlist/shared/components/cards/ListingCard.jsx";
import { Promos, Shortcuts } from "@vezlist/shared/components/FeedRails.jsx";
import { useShell } from "@vezlist/shared/components/layout/AppLayout.jsx";
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
import { useSearch } from "@vezlist/shared/context/SearchContext.jsx";
import { searchListings } from "@vezlist/shared/lib/api/discovery.js";
import { SITE_SCOPE } from "@vezlist/shared/lib/api/client.js";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  filtersToQueryString,
  paramsToFilters,
} from "@vezlist/shared/lib/filters.js";
import { MAX_NAME } from "@vezlist/shared/lib/search.js";
import {
  categoryById,
  categoryByLabel,
  categoryPath,
  getCategories,
} from "@vezlist/shared/lib/taxonomy.js";

/**
 * `filters.sort`/`filters.postedWithin` (this app's own vocabulary, shared
 * with the mock-era `applyFilters`) to the backend's `DiscoverySort` /
 * `PostedWithin` enum names, which Spring's default query-param binding
 * matches by exact `Enum.valueOf` — lowercase-with-dashes will not bind.
 */
const SORT_TO_API = {
  newest: "NEWEST",
  "price-asc": "PRICE_ASC",
  "price-desc": "PRICE_DESC",
  nearest: "NEAREST",
};
const POSTED_WITHIN_TO_API = { "24h": "HOURS_24", "7d": "DAYS_7", "30d": "DAYS_30" };

/** A selected area's label (the only shape `data/locations.js` carries) to the
 * real area id `DiscoverySearchRequest.area()` expects, via the location tree
 * `FeedContext` fetched from GET /api/v1/locations. */
function areaIdForLabel(locations, label) {
  if (!locations) return null;
  for (const province of locations.provinces ?? []) {
    const hit = (province.areas ?? []).find((a) => a.label === label);
    if (hit) return hit.id;
  }
  return null;
}

const PAGE_SIZE = 20;

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
  if (filters.categories.length) {
    const ids = filters.categories
      .map((label) => categoryByLabel(label)?.id)
      .filter(Boolean);
    if (ids.length) params.category = ids;
  }
  if (filters.cities.length) {
    const ids = filters.cities
      .map((label) => areaIdForLabel(locations, label))
      .filter(Boolean);
    if (ids.length) params.area = ids;
  }
  // Not sent, because the backend has nothing to match them against:
  // `filters.subcategory` (real categories carry no sub-category at all —
  // see `lib/taxonomy.js`) and personals-only facets, which this screen
  // never sets in the first place.
  return params;
}

/** A `DiscoveryListingResponse` row, shaped the way `ListingCard` and
 * `FilterSheet`'s (approximate, page-local) live count read a row. */
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

/**
 * Four ways to re-cut the feed. Unlike the mock-era version, none of these
 * carries a live count or a thumbnail stack any more — both were measured
 * off the full mock `listings` array at module scope, and there is no
 * equivalent "the whole board, in memory" object to measure a real backend
 * this way without a dedicated counting endpoint (which does not exist) or
 * three extra search requests just to fill a rail. What is left is what
 * each tile actually does: re-cut the feed underneath it.
 */
const SHORTCUTS = [
  {
    id: "nearby",
    label: "Nearby Map",
    sub: "Find nearby",
    Icon: MapPin,
    href: "/nearby",
    accent: "brand",
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
  {
    id: "trending",
    label: "Trending",
    sub: "This week",
    Icon: BadgeCheck,
    patch: { postedWithin: "7d", sort: "newest" },
    accent: "purple",
  },
  {
    id: "verified",
    label: "Verified",
    sub: "Checked ads",
    Icon: BadgeCheck,
    patch: { verifiedOnly: true },
    accent: "green",
  },
];

export default function BrowseScreen() {
  const { filters, setFilters, query, setQuery, locations } = useFeed();
  const { openPost } = useShell();
  const navigate = useNavigate();
  const { recent, saved, recordSearch, clearRecent, saveSearch, deleteSaved } =
    useSearch();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [params] = useSearchParams();
  const catParam = params.get("cat");
  const subParam = params.get("sub");

  useEffect(() => {
    const label = categoryById(catParam)?.label;
    setFilters((f) =>
      label
        ? {
            ...f,
            categories: [label],
            // Real categories carry no sub-category at all (see
            // `lib/taxonomy.js`), so a `?sub=` on a real build never has
            // anything to resolve against — it is dropped rather than
            // applied, the same way an unrecognised one already was.
            subcategory: null,
          }
        : f,
    );
    // `subParam` intentionally unused now — kept read above only so a
    // future real sub-category could reuse this effect without also
    // relearning where `?sub=` comes from.
  }, [catParam, subParam, setFilters]);

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));
  const activeCategory =
    filters.categories.length === 1 ? filters.categories[0] : null;
  const heading = categoryPath(activeCategory, null) || "Latest ads";

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
    // `locations` is an object that only ever changes once (mock → real);
    // it is a real dependency (area filtering needs it) but not one worth
    // debouncing against.
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
      .catch(() => setError((e) => e ?? new Error("Couldn't load more ads")))
      .finally(() => setLoadingMore(false));
  }

  const cards = useMemo(() => items.map(toCardListing), [items]);
  const filterCount = activeFilterCount(filters);

  const searchQ = query.trim();
  const searchItems = useMemo(() => {
    if (searchQ) {
      // Category/sub-category suggestions still come from the real
      // taxonomy; listing suggestions are gone — they used to be found by
      // running `applyFilters` over the entire mock board in memory, which
      // has no equivalent now that the board lives on a server. Typing and
      // pressing enter still searches the real feed via `q`.
      const q = searchQ.toLowerCase();
      const hits = [];
      for (const c of getCategories()) {
        if (hits.length >= 8) break;
        if (c.label.toLowerCase().includes(q)) {
          hits.push({ id: `cat:${c.id}`, type: "category", label: c.label });
        }
      }
      return hits;
    }
    if (!recent.length) return [];
    return [
      ...recent.map((r) => ({
        id: `recent:${r.term}`,
        type: "recent",
        label: r.term,
        meta: "Recent",
      })),
      { id: "clear-recent", type: "clear", label: "Clear recent searches" },
    ];
  }, [searchQ, recent]);

  function handleSelectSuggestion(item) {
    switch (item.type) {
      case "clear":
        clearRecent();
        return;
      case "recent":
        setQuery(item.label);
        recordSearch(item.label);
        return;
      case "category":
        setFilters((f) => ({ ...f, categories: [item.label], subcategory: null }));
        setQuery("");
        recordSearch(item.label);
        return;
      default:
        return;
    }
  }

  function handleSubmitSearch(term) {
    const clean = (term ?? "").trim();
    if (clean) recordSearch(clean);
  }

  const canSaveSearch = filterCount > 0 || searchQ.length > 0;

  function openSaveDialog() {
    setSaveName(heading !== "Latest ads" ? heading : "");
    setSaveOpen(true);
  }

  function confirmSave() {
    const name = saveName.trim();
    if (!name) return;
    saveSearch(name, filtersToQueryString(filters, query));
    setSaveOpen(false);
  }

  function runSaved(row) {
    const next = paramsToFilters(row.params);
    setFilters(next.filters);
    setQuery(next.query);
  }

  return (
    <>
      <PageBody className="px-4 pb-8 lg:px-8">
        <div className="pb-3 pt-3 lg:pt-4">
          <div className="flex gap-2.5">
            <SearchBar
              className="flex-1"
              placeholder="Search ads, sellers, places…"
              value={query}
              onChange={setQuery}
              suggestions={searchItems}
              onSelectSuggestion={handleSelectSuggestion}
              onSubmit={handleSubmitSearch}
            />

            {canSaveSearch && (
              <button
                onClick={openSaveDialog}
                aria-label="Save this search"
                className="grid size-12 shrink-0 place-items-center rounded-card bg-surface text-ink shadow-card transition-transform hover:-translate-y-0.5 active:scale-95 lg:size-[52px]"
              >
                <BookmarkPlus className="size-[18px]" strokeWidth={2.2} />
              </button>
            )}

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

          {saved.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
              {saved.map((s) => (
                <div
                  key={s.id}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft py-1 pl-3.5 pr-1.5"
                >
                  <button
                    type="button"
                    onClick={() => runSaved(s)}
                    className="flex items-center gap-1.5 text-[13px] font-bold text-brand"
                  >
                    <Bookmark className="size-3.5" strokeWidth={2.4} />
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSaved(s.id)}
                    aria-label={`Delete saved search "${s.name}"`}
                    className="grid size-6 shrink-0 place-items-center rounded-full text-brand/70 transition-colors hover:bg-brand hover:text-on-brand"
                  >
                    <X className="size-3.5" strokeWidth={2.6} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2.5">
            <LocationBar
              filters={filters}
              onPatch={patch}
              className="min-w-0"
            />
          </div>

          <Shortcuts
            items={SHORTCUTS}
            filters={filters}
            onPatch={patch}
            className="mt-3"
          />
        </div>
        <div className="pt-1">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h3
              title={heading}
              className="min-w-0 truncate text-[17px] font-bold text-ink"
            >
              {heading}
            </h3>
            <FilterButton
              className="shrink-0"
              filters={filters}
              onClick={() => setSheetOpen(true)}
            />
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
              title="Couldn't load ads"
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
              title="No ads match your filters"
              body="Try clearing a filter or widening your search."
              action={<Button onClick={resetAll}>Clear filters</Button>}
            />
          )}

          <Promos
            className="mt-3"
            cards={[
              {
                id: "sell",
                Icon: Tag,
                iconClass: "text-brand-2",
                title: "Sell Yours",
                sub: "Post an ad in a minute",
                cta: "Post Ad",
                ctaClass: "bg-brand-strong text-white",
                onClick: openPost,
                thumbs: cards.slice(0, 3).map((l) => l.image).filter(Boolean),
              },
            ]}
          />
        </div>
      </PageBody>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        listings={cards}
        query={query}
        initialGroup="sort"
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />

      <Modal
        open={saveOpen}
        title="Save this search"
        subtitle="Re-run it in one tap from the search row."
        onClose={() => setSaveOpen(false)}
        size="max-w-md"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setSaveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={confirmSave}
              disabled={!saveName.trim()}
            >
              Save
            </Button>
          </div>
        }
      >
        <Field label="Name" hint={`${MAX_NAME - saveName.length} left`}>
          <input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value.slice(0, MAX_NAME))}
            onKeyDown={(e) => e.key === "Enter" && confirmSave()}
            placeholder={heading !== "Latest ads" ? heading : "My search"}
            className={`${FIELD} ${border(null)}`}
          />
        </Field>
      </Modal>
    </>
  );
}
