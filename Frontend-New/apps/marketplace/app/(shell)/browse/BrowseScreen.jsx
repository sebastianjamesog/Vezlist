"use client";

import { useMemo, useEffect, useState } from "react";
import {
  BadgeCheck,
  Bookmark,
  BookmarkPlus,
  ChartNoAxesCombined,
  MapPin,
  Rocket,
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
import { usePromote } from "@vezlist/shared/lib/usePromote.js";
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
import { useReports } from "@vezlist/shared/context/ReportsContext.jsx";
import { useSearch } from "@vezlist/shared/context/SearchContext.jsx";
import { hideBlocked } from "@vezlist/shared/lib/reports.js";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  filtersToQueryString,
  paramsToFilters,
} from "@vezlist/shared/lib/filters.js";
import { MAX_NAME, suggest } from "@vezlist/shared/lib/search.js";
import { categoryPath, isSubOf } from "@vezlist/shared/lib/taxonomy.js";
import { categories, listings } from "@vezlist/shared/data/mock.js";

/*
  The numbers the rail reports, measured off the board rather than written down
  beside it. Each one is the length of the cut its own tile applies, produced by
  the same `applyFilters` the feed underneath runs — a tile promising "13 new"
  and opening onto nine ads is worse than a tile promising nothing, and running
  the real function against the real list is the only way that stays true when
  somebody edits the mock.

  Module scope, and now entirely so: every input here is a module constant, so
  every number is settled before the first render and none of it depends on the
  reader. The rail used to carry a Saved tile whose count came out of this
  browser's localStorage, which is what forced the list to be rebuilt inside
  the component; that tile is gone and the list is a plain constant again.
*/
const cut = (patch) => applyFilters(listings, { ...DEFAULT_FILTERS, ...patch });

const today = cut({ postedWithin: "24h", sort: "newest" });
const thisWeek = cut({ postedWithin: "7d" });
const checked = cut({ verifiedOnly: true });
// The week by arrival and the week by attention are two orders of the same
// ads. The count is what the tap will show; the photos are what the week has
// actually been opening. Sorted on a copy — `thisWeek` is used as it stands.
const mostViewed = [...thisWeek].sort((a, b) => b.views - a.views);

/**
 * The first four photos of a cut, which is as many as the stack shows.
 *
 * Photos of the goods, not faces of the sellers: this board sells objects, and
 * a row of portraits over a heading that counts washing machines would be
 * answering a question nobody asked it. The personals rail makes the opposite
 * call for the opposite reason.
 */
const shots = (rows) => rows.slice(0, 4).map((l) => l.image);

/**
 * Four ways to re-cut the feed, in the order they get reached for. The one
 * link goes somewhere; the three buttons patch the same filters the sheet
 * writes, so the chips underneath still say what is on.
 *
 * It was six. Closest and Saved came out because neither was a cut of the
 * board in the way the rest are: Closest re-sorted rather than narrowed, so
 * the tile could never light up as active and tapping it changed the order of
 * the same ads under a heading that had not moved, and Saved was a link to a
 * page about this reader sitting in a rail about the board. A rail that
 * scrolls past the edge earns its length by every tile being worth the swipe.
 *
 * The personals board runs the same rail with its own five — the shape is
 * shared, the items and the vocabulary are what make it this site's.
 */
const SHORTCUTS = [
  {
    id: "nearby",
    label: "Nearby Map",
    // No stat line: the map answers *where*, and a number in the accent colour
    // would be quoting a radius nobody has set. How much it plots goes in the
    // footer pill, where it reads as the size of the thing being opened rather
    // than as a measurement of the board you are standing on.
    sub: "Find nearby",
    Icon: MapPin,
    href: "/nearby",
    accent: "brand",
    count: listings.length,
  },
  {
    id: "new",
    label: "New Today",
    stat: `${today.length} new`,
    Icon: Sparkles,
    patch: { postedWithin: "24h", sort: "newest" },
    accent: "amber",
    pill: "NEW",
    thumbs: shots(today),
  },
  {
    id: "trending",
    label: "Trending",
    stat: `${thisWeek.length} this week`,
    Icon: ChartNoAxesCombined,
    patch: { postedWithin: "7d", sort: "newest" },
    accent: "purple",
    thumbs: shots(mostViewed),
  },
  {
    id: "verified",
    label: "Verified",
    stat: `${checked.length} checked`,
    Icon: BadgeCheck,
    patch: { verifiedOnly: true },
    accent: "green",
    thumbs: shots(checked),
  },
];

/**
 * The feed. Home is the category launcher; this is where a chosen category
 * lands, so it opens on whatever ?cat= the tile carried in.
 *
 * It is the personals board's home screen with the status tray taken out —
 * same search row, same shortcut rail, same feed, no app bar. Categories are
 * picked on the launcher that sends you here and changed in the filter sheet;
 * a strip of them on top of a rail of shortcuts was two rows of chrome asking
 * the same question.
 *
 * Personals is not a category here — it is its own site, reached from the
 * launcher's Personals tile.
 */
export default function BrowseScreen() {
  // Filters live above the routes: the status player unmounts this screen.
  const { filters, setFilters, query, setQuery } = useFeed();
  const { blocked } = useReports();
  const { openPost } = useShell();
  // The Boost tile needs a destination, not a message; the hook picks it.
  const promote = usePromote();
  const navigate = useNavigate();
  const { recent, saved, recordSearch, clearRecent, saveSearch, deleteSaved } =
    useSearch();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [params] = useSearchParams();
  const catParam = params.get("cat");
  // `params.get` has already percent-decoded this, so "Cars%20%26%20Trucks"
  // arrives as "Cars & Trucks". Do not decodeURIComponent it again — a label
  // containing a literal % would then throw, and one containing "%26" would
  // silently become "&".
  const subParam = params.get("sub");

  // ponytail: ?cat= is an entry parameter, not a mirror of the filter. Picking
  // a different category in the strip leaves the URL behind rather than
  // rewriting it — a two-way sync buys nothing here and fights itself.
  //
  // ?sub= rides along with it and is only ever read next to it: a sub-category
  // has no meaning without the category it hangs off, so there is nothing a
  // lone ?sub= could apply to. `isSubOf` is the gate, and it deliberately
  // passes a missing sub — the absent case is the normal one. A sub that
  // belongs to some *other* category is dropped rather than applied, because a
  // hand-edited or stale link would otherwise open an empty feed with a filter
  // the sheet cannot show and therefore cannot explain.
  useEffect(() => {
    const label = categories.find((c) => c.id === catParam)?.label;
    setFilters((f) =>
      label
        ? {
            ...f,
            categories: [label],
            // `|| null` rather than `?? null`: a bare "?sub=" is an empty
            // string, and every other reader of this field tests it for
            // truthiness, so storing "" would be a second spelling of "none".
            subcategory: isSubOf(label, subParam) ? subParam || null : null,
          }
        : f,
    );
  }, [catParam, subParam, setFilters]);

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));
  // One picked category names the screen; anything else is just "Latest ads".
  const activeCategory =
    filters.categories.length === 1 ? filters.categories[0] : null;
  // The heading says the whole path, so a feed narrowed twice does not read as
  // if only the category were on. Empty string when nothing is picked, which
  // is what falls through to the default name.
  const heading =
    categoryPath(activeCategory, filters.subcategory) || "Latest ads";

  function resetAll() {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  }

  /*
    Filters first, then the people this reader has blocked (#4).

    In that order and not the other way round: a block is not a filter. It has
    no chip above the feed and no count anywhere, because the point of blocking
    somebody is not hearing from them again and a line reading "3 ads hidden"
    is hearing from them again. It is applied here, at the last point before
    the cards, so no cut of the feed — a category, a search, a shortcut — can
    route around it.
  */
  const visible = hideBlocked(applyFilters(listings, filters, query), blocked);
  const filterCount = activeFilterCount(filters);

  /**
   * What the search combobox offers, in one list because `SearchBar` only
   * knows how to render rows — which rows those are is entirely this
   * screen's call.
   *
   * With something typed, it's `lib/search.js`'s `suggest`: matching
   * categories, their sub-categories, and matching listings, found with the
   * exact `applyFilters` matcher the feed itself narrows with. With the box
   * empty, it's this reader's own history instead — recent terms, and a row
   * to clear them, so a history that is never offered a way to be forgotten
   * is not offered at all.
   */
  const searchQ = query.trim();
  const searchItems = useMemo(() => {
    if (searchQ) return suggest(searchQ, { categories, listings });
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
        setFilters((f) => ({
          ...f,
          categories: [item.label],
          subcategory: null,
        }));
        setQuery("");
        recordSearch(item.label);
        return;
      case "subcategory":
        setFilters((f) => ({
          ...f,
          categories: [item.category],
          subcategory: item.subcategory,
        }));
        setQuery("");
        recordSearch(item.label);
        return;
      case "listing":
        recordSearch(searchQ || item.label);
        navigate(`/ad/${item.adId}`);
        return;
      default:
        return;
    }
  }

  // Enter with nothing highlighted: the box is already filtering the feed as
  // it's typed, so submitting just records the term for next time.
  function handleSubmitSearch(term) {
    const clean = (term ?? "").trim();
    if (clean) recordSearch(clean);
  }

  // A saved search has to save *something* — an empty query against
  // `DEFAULT_FILTERS` is "everything", which is already what opening the
  // screen shows.
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

  // The stored `params` string is the exact shape `filtersToQueryString`
  // wrote it in — `paramsToFilters` is that function's inverse, so re-running
  // a saved search is applying its own inverse to what it stored, nothing
  // more.
  function runSaved(row) {
    const next = paramsToFilters(row.params);
    setFilters(next.filters);
    setQuery(next.query);
  }

  return (
    <>
      <PageBody className="px-4 pb-8 lg:px-8">
        {/* Hero: search, then the place it searches in. */}
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
          {visible.length ? (
            <>
              {/* Heading and controls are one cluster, not two blocks.

                  The result count is gone. A number that changes with every
                  chip tap invites you to check it rather than to look at what
                  is under it, and the board is right there to be counted; the
                  personals home dropped the same number for the same reason.
                  What is left is the path and the one control that changes it,
                  so the row closes up — the gap above it is a hair instead of a
                  band, and the gap below it is what separates the cluster from
                  the results it names.

                  `shrink-0` stays on the Filter button, so a long path spends
                  only the room left over and ellipsises rather than pushing it
                  off a 430px row. The tail is what gets cut, which loses the
                  sub-category — the sheet still names it and `title` recovers
                  it on a pointer, so the trade is one of emphasis, not of
                  information. */}
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h3
                  title={heading}
                  className="min-w-0 truncate text-[17px] font-bold text-ink"
                >
                  {heading}
                </h3>
                {/* The same sheet as the icon in the search row. That one is
                    reachable with a thumb; this one sits on the heading it
                    qualifies, which is where you look when the feed under it is
                    not what you asked for. */}
                <FilterButton
                  className="shrink-0"
                  filters={filters}
                  onClick={() => setSheetOpen(true)}
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                {visible.map((l) => (
                  <ListingCard key={l.id} listing={l} chevron />
                ))}
              </div>
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
                id: "sell",
                Icon: Tag,
                iconClass: "text-brand-2",
                title: "Sell Yours",
                sub: "Post an ad in a minute",
                cta: "Post Ad",
                ctaClass: "bg-brand-strong text-white",
                onClick: openPost,
                thumbs: visible.slice(0, 3).map((l) => l.image),
              },
            ]}
          />
        </div>
      </PageBody>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        listings={listings}
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
