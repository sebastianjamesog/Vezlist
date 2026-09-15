"use client";

import { useState } from "react";
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
import { useReports } from "@vezlist/shared/context/ReportsContext.jsx";
import { hideBlocked } from "@vezlist/shared/lib/reports.js";
// The context, the hook and the grouping function all still say "status": the
// label on screen is Stories, the identifiers underneath it are not renamed.
import { useStatus } from "@vezlist/shared/context/StatusContext.jsx";
import { useToast } from "@vezlist/shared/context/ToastContext.jsx";
import { usePromote } from "@vezlist/shared/lib/usePromote.js";
import { groupStatuses } from "@vezlist/shared/lib/status.js";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
} from "@vezlist/shared/lib/filters.js";
import { liveStreams, personalsListings } from "@vezlist/shared/data/mock.js";
import ListingCard from "@vezlist/shared/components/cards/ListingCard.jsx";
import { Promos, Shortcuts } from "@vezlist/shared/components/FeedRails.jsx";
import { useDiscreet } from "../useDiscreet";

/**
 * The home screen of personals.vezlist.cc.
 *
 * There is no category strip: the marketplace's categories describe objects,
 * and this board lists people. What a post is for and who is posting are the
 * two cuts this board is searched by, so they sit on the board itself — two
 * buttons over the feed, opening a modal of their own — rather than behind the
 * filter icon with the settings you change once. The way out is the Category
 * tab in the bar, which crosses to the marketplace origin.
 *
 * The 18+ notice that used to sit at the top of this page is now the age gate
 * in the root layout: a strip you scroll past is not a declaration, and the
 * room it took is better spent on the board.
 *
 * No app bar: the search field is the first thing on the screen, and the row of
 * shortcuts under it is the rest of the answer. The bar's crossing back to the
 * marketplace lives on every other screen here, not on this one.
 */
/**
 * A pill over the feed. It carries its own count, because the whole point of
 * lifting these two out of the filter sheet is that you can see what they are
 * set to without opening anything.
 */
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

/*
  The five numbers the rail above the board reports, each one measured off the
  board itself rather than written down beside it. A tile that says "7 new" and
  opens onto nine posts is worse than a tile that says nothing, and the only way
  to be sure it never does is to run the same `applyFilters` the feed runs, with
  the same patch the tile applies, over the same list the feed reads.

  Measured once at module scope because every input is a module constant. The
  day any of them stops being one — a live count off a socket, a feed off the
  network — these move into the component and become state; until then, running
  them on every render would be five sorts a second for a set of numbers that
  cannot change.
*/
const cut = (patch) =>
  applyFilters(personalsListings, { ...DEFAULT_FILTERS, ...patch });

const availableNow = cut({ availableOnly: true });
const thisWeek = cut({ postedWithin: "7d" });
const today = cut({ postedWithin: "24h", sort: "newest" });
// The week counted by arrival and the week ranked by attention are two
// different orders of the same posts, and the tile wants both: the count is
// what the tap will show you, the faces are what the week is actually looking
// at. Sorting a copy — `thisWeek` is handed straight to a tile below it.
const mostWatched = [...thisWeek].sort((a, b) => b.views - a.views);

/** The first four photos of a cut, which is as many as the stack shows. */
const faces = (rows) => rows.slice(0, 4).map((l) => l.image);

/**
 * Five ways into the board, in the order they are reached for: the two that
 * leave this screen first, then the three that re-cut the feed you are already
 * looking at. Those three are buttons, not links — they patch the same filters
 * the sheet writes, so the chips below still say what is on.
 *
 * Stories used to be one of these and no longer is. The rail further down the
 * page already holds every story there is, unwatched first and scrolling, so
 * the tile was a second door onto a thing that was already open — and a KPI
 * card is a poor door: the others here report how much of the board is of a
 * kind, and "stories" is not a cut of the board at all.
 */
const SHORTCUTS = [
  {
    id: "live",
    label: "Live Now",
    stat: `${liveStreams.length} live`,
    Icon: Radio,
    href: "/live",
    accent: "rose",
    // The only tile whose faces are people rather than posts, because it is
    // the only one whose subject is a person: a broadcast is somebody's face,
    // an ad is a photo of what is on offer.
    thumbs: liveStreams.slice(0, 4).map((s) => s.avatar),
  },
  {
    id: "nearby",
    label: "Nearby Map",
    // No stat: the map's answer is *where*, and a tile that reported "12
    // nearby" would be quoting a distance nobody has set yet. The count of
    // what it plots goes in the footer pill instead, where it reads as the
    // size of the thing you are opening rather than as a measurement of the
    // board you are on.
    sub: "Find nearby",
    Icon: MapPin,
    href: "/nearby",
    accent: "brand",
    count: personalsListings.length,
  },
  {
    // It counts the posts whose author has said, in the Availability switch on
    // their settings screen, that they are free to be contacted right now.
    // That switch is the only source: availability is never inferred from
    // distance or from how recently somebody posted, because an inference of
    // that kind is a guess the reader takes as a promise, and the reader here
    // is deciding whether to message a stranger this evening. It used to be
    // exactly such a guess — posts within five kilometres — and now that
    // `availableOnly` is a real filter the tile patches it, so the count and
    // the board it opens onto are the same cut of the same list.
    //
    // Which is also why it is the one number on this rail with a shelf life.
    // The other four measure the board — how much of it arrived this week,
    // this day — and are as true an hour from now as they are on load. This
    // one is true at load and decays, and it is measured at module scope with
    // the rest anyway: the switches behind it live on other people's devices,
    // so nothing this build could re-run would make the count fresher. When
    // there is a server behind these flags, this is the tile that moves into
    // the component and becomes state, and the comment above `cut` says so.
    id: "available",
    label: "Available Now",
    stat: `${availableNow.length} now`,
    dot: true,
    patch: { availableOnly: true },
    accent: "green",
    thumbs: faces(availableNow),
  },
  {
    id: "trending",
    label: "Trending",
    stat: `${thisWeek.length} this week`,
    Icon: ChartNoAxesCombined,
    patch: { postedWithin: "7d", sort: "newest" },
    accent: "purple",
    thumbs: faces(mostWatched),
  },
  {
    id: "new",
    label: "New Today",
    stat: `${today.length} new`,
    Icon: Sparkles,
    patch: { postedWithin: "24h", sort: "newest" },
    accent: "amber",
    pill: "NEW",
    thumbs: faces(today),
  },
];

export default function Personals() {
  const { filters, setFilters, query, setQuery } = useFeed();
  const { blocked } = useReports();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState(null);
  const [discreet, setDiscreet] = useDiscreet();
  const { seen, stories } = useStatus();
  const toast = useToast();
  const promote = usePromote();

  // `mine` is deliberately dropped on the floor. Adding your own story is an
  // account action now and lives on the profile screen, so the rail carries
  // other people's stories only and opens on a real one rather than on a
  // composer tile that is mostly there to be scrolled past.
  //
  // Expiry (#30) needs no filter of its own here: `groupStatuses` already
  // drops anything past `STORY_TTL_MS` before it ever reaches `recent` or
  // `viewed`, the same as it always dropped a story with no updates — one
  // rule, in the one function everything reading the rail goes through, not
  // a second copy of "is this still current" living beside it in a screen.
  // `stories` comes from the context rather than straight off the mock: it
  // is the seed with this device's own posted updates folded into the `own`
  // story. The rail still drops `mine` (see below), but the player the rail
  // links into reads the same merged list, so the two cannot disagree about
  // what exists.
  const { recent, viewed } = groupStatuses(stories, seen);
  // Unwatched first, then the ones already seen — the tray scrolls, so all of
  // them fit and none has to be dropped.
  const shownStatuses = [...recent, ...viewed];

  const patch = (next) => setFilters((f) => ({ ...f, ...next }));
  /*
    Filters first, then the people this reader has blocked (#4) — the same
    order and the same reasoning as the marketplace's Browse screen. A block
    has no chip and no count: it is not a filter the reader can see or clear,
    it is a row that should never have been offered. Applied here, at the last
    point before the cards, so no picker or shortcut can route around it.
  */
  const visible = hideBlocked(
    applyFilters(personalsListings, filters, query),
    blocked,
  );
  const filterCount = activeFilterCount(filters);

  function resetAll() {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  }

  return (
    <>
      <PageBody className="px-4 pb-8 lg:px-8">
        <h1 className="sr-only">Vezlist Personals</h1>
        <div className="pb-3 pt-3 lg:pt-4">
          <div className="flex gap-2.5">
            <SearchBar
              className="min-w-0 flex-1"
              placeholder="Search personals…"
              value={query}
              onChange={setQuery}
            />

            {/* Discreet mode earns a permanent slot rather than a settings row:
                it is the control you reach for when someone walks in. */}
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

          {/* The shortcuts, sitting between the two controls that narrow the
              board by hand and the board itself: the ones that re-cut the feed
              patch the same filters the sheet writes, so the chips below still
              say what is on.

              A constant, not a computed list. It used to be rebuilt on every
              render only so the stories tile could be handed the head of the
              story queue; that tile is gone and every number on the remaining
              five is measured off module-level data, so there is nothing left
              here for a render to decide. */}
          <Shortcuts
            items={SHORTCUTS}
            filters={filters}
            onPatch={patch}
            className="mt-3"
          />
        </div>

        {/* No "See all" beside the heading any more. The rail already holds
            every story there is — unwatched first, watched after, and it
            scrolls — so the link went to a page that repeated it in a taller
            shape. The label reads Stories; the context and the route behind it
            are still called status. */}
        {/* The heading goes with the rail. With no "Your story" tile to fall
            back on, an empty list means an empty rail, and a section label
            standing over nothing is worse than no section. */}
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
          {visible.length ? (
            <>
              {/* Heading and controls are one block, not two.

                  The 18+ badge is gone: the age gate is the declaration, and a
                  pill that repeats it on every scroll is a label nobody reads
                  twice. The post count went with it — the board is right there
                  to be counted, and a number that changes with every chip tap
                  invites you to check it rather than to look at the results.
                  What is left is a word and the three controls that change
                  what sits under it, so they close up into one cluster. */}
              <div className="mb-3">
                <h3 className="text-[17px] font-bold leading-tight text-ink">
                  Browse
                </h3>

                {/* Category and ethnicity open their own modal; Filter opens
                    the sheet with everything else. */}
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

              {/* One column on a phone: these are rows, not tiles, and the
                  status rail either side of a row is what makes it scannable.
                  Desktop has the width for two or three of them. */}
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                {visible.map((l) => (
                  <ListingCard key={l.id} listing={l} chevron />
                ))}
              </div>
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
        listings={personalsListings}
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
        listings={personalsListings}
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
