"use client";

import { useState } from "react";
import { ArrowRight, LayoutGrid, Search } from "lucide-react";
import BrandMark from "@vezlist/shared/components/layout/BrandMark.jsx";
import LocationBar from "@vezlist/shared/components/LocationBar.jsx";
import FilterSheet from "@vezlist/shared/components/FilterSheet.jsx";
import { useNavigate } from "@vezlist/shared/lib/nav.jsx";
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
import { SITE_NAME } from "@vezlist/shared/lib/sites.js";
import CategoryGrid from "./CategoryGrid.jsx";

/**
 * The front door, and the one screen in the app that does not scroll.
 *
 * Where you are, what you want, and a way in — in that order, with the nine
 * category tiles carrying the weight. This used to be a heading, a location
 * card and a grid, each about as loud as the next, which left nothing for the
 * eye to land on first. It reads top to bottom now as one descending line: the
 * logo lockup introduces the place, the search field and the location row are
 * two thin controls that qualify it, and then the grid — the only block on the
 * screen with colour in it — is plainly the thing to touch.
 *
 * ── Why it does not scroll ──────────────────────────────────────────────────
 *
 * A launcher that scrolls is a launcher with something under the fold, and
 * anything under the fold on the first screen of an app is something most
 * people never find. There was a rail of the day's newest ads down there; it is
 * gone, and it took the last reason to scroll with it.
 *
 * So this screen does not use `PageBody`. It is its own flex column filling the
 * shell, and the grid is the single flexible row in it: everything above and
 * below the grid is a fixed height, the grid takes whatever is left, and the
 * tiles grow with the phone instead of the page growing past it. That is also
 * why the tile height moved into `CategoryGrid` as a floor rather than a fixed
 * value — this screen sets the height of the grid, and the rows divide it.
 *
 * The column is still `overflow-y-auto`, and neither it nor the grid will
 * shrink below its own content, so the failure mode is honest rather than
 * silent: on a viewport genuinely too short for the layout — a phone held
 * sideways, a browser stacking three toolbars — it scrolls, instead of clipping
 * the bottom row of doorways somewhere unreachable. Two sentences go first,
 * under 720px of height: the tagline and the section subtitle both hide, on the
 * grounds that losing a line of prose is much cheaper than losing a row of
 * tiles.
 *
 * No app bar here. It carried the wordmark, and the wordmark is already the
 * biggest thing on the screen — two of them a centimetre apart read as a
 * rendering bug. Every other screen keeps its bar; this one is the exception
 * because it is the only one that introduces itself.
 *
 * Nothing on this screen is a decoration that goes nowhere. The search field
 * writes the feed's query and follows it to /browse; the location row opens the
 * picker; every tile is a link; All categories opens the sheet, and applying it
 * lands on the feed. There are no dead controls to explain away with a toast.
 */
export default function Home() {
  const { filters, setFilters, query, setQuery } = useFeed();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const patch = (next) => setFilters((f) => ({ ...f, ...next }));

  function search(e) {
    e.preventDefault();
    // The feed owns the query, the same as it owns the filters — this screen
    // sets it and then hands over. An empty box is a valid search: it lands on
    // /browse with nothing narrowed, which is where the button says it goes.
    setQuery(term.trim());
    navigate("/browse");
  }

  return (
    <>
      {/**
       * `data-scroll` is kept even though the usual state of this element is
       * "nothing to scroll": it is what `AppLayout` reaches for to reset a
       * screen on a route change, and on the short viewports where this one
       * does scroll it has to be reset like any other.
       *
       * `pb-nav` is the clearance for the floating tab bar, which overlays the
       * screen rather than reserving a band under it. As padding on the scroll
       * container it comes out of the height the flex children divide, so the
       * All categories button lands above the bar rather than behind it.
       */}
      <div
        data-scroll
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-top pb-nav lg:px-8 lg:pb-6"
      >
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col pb-2">
          {/* Mark and name sit on one line, not stacked, because a screen that
              has given up scrolling buys its vertical space back wherever it
              can — and a horizontal lockup is how the logo is drawn anyway.

              Only the mark carries the gradient. The name used to wear it too,
              and two gradients a few pixels apart read as one gradient that
              failed to line up; a flat name also lets the thing that is
              actually the logo be the thing that looks like one — now more so,
              since the mark is the blue tile off the real logo rather than the
              chevron this screen was briefly given. It is the same 36/44px box
              either way, which is the point: the height budget that keeps this
              screen inside one viewport does not move. */}
          <header className="flex flex-col items-center pb-2">
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-9 lg:size-11" />
              <h1 className="text-[34px] font-extrabold leading-none tracking-tight text-ink lg:text-[44px]">
                {SITE_NAME}
              </h1>
            </div>
            <p className="mt-1.5 hidden text-[13px] font-medium text-muted [@media(min-height:720px)]:block">
              Buy, sell and hire across Canada.
            </p>
          </header>

          {/* Search is one control, not two: the field and the button submit
              the same form, so Enter on a keyboard and a thumb on the arrow do
              the identical thing. The <search> wrapper is the landmark — the
              real element rather than role="search" on the form, which says the
              same thing the older way. */}
          <search>
            <form onSubmit={search} className="flex gap-2.5">
              <label className="flex h-12 flex-1 items-center gap-3 rounded-card bg-surface px-4 shadow-card transition-shadow focus-within:shadow-lift lg:h-[52px] lg:px-5">
                <Search
                  aria-hidden="true"
                  className="size-[18px] shrink-0 text-muted"
                  strokeWidth={2.4}
                />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={"Search ads, sellers, places…"}
                  aria-label={"Search ads, sellers, places…"}
                  // An <input> carries an intrinsic width of about twenty
                  // characters and will not shrink below it inside a flex row
                  // without this.
                  className="w-full min-w-0 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted"
                />
              </label>
              <button
                type="submit"
                aria-label={"Search"}
                className="brand-gradient grid size-12 shrink-0 place-items-center rounded-card text-on-brand shadow-pop transition-transform hover:-translate-y-0.5 active:scale-95 lg:size-[52px]"
              >
                <ArrowRight className="size-5" strokeWidth={2.6} />
              </button>
            </form>
          </search>

          <LocationBar
            variant="card"
            filters={filters}
            onPatch={patch}
            className="mt-2 shrink-0"
          />

          {/* The one flexible block on the screen. `flex-1` with no `min-h-0`
              is the whole trick: the section takes the leftover height when
              there is any, and refuses to be squeezed below the grid's own
              minimum when there is not — at which point the container above it
              scrolls rather than eating a row of tiles. */}
          <section
            aria-labelledby="home-categories"
            className="mt-2.5 flex flex-1 flex-col"
          >
            <div className="mb-1.5">
              <h2
                id="home-categories"
                className="text-[17px] font-bold leading-tight text-ink"
              >
                Browse categories
              </h2>
              <p className="mt-0.5 hidden text-[13px] text-muted [@media(min-height:720px)]:block">
                Pick where you want to start.
              </p>
            </div>

            <CategoryGrid className="flex-1 lg:flex-none" />

            {/* Nine tiles is not nineteen categories — this opens the sheet on
                the rest of them. Applying with nothing ticked is still the way
                to the feed with nothing narrowed at all. */}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="mt-2 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-card border border-line bg-surface py-2.5 text-[15px] font-semibold text-brand transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card lg:py-3.5"
            >
              <LayoutGrid
                aria-hidden="true"
                className="size-4"
                strokeWidth={2.4}
              />
              All categories
            </button>
          </section>
        </div>
      </div>

      {/* The launcher has no feed of its own, so applying here does not stay:
          it writes the filters the feed reads and follows them over to it. */}
      {/* This screen has no feed of its own to count against — real
          listings live behind BrowseScreen's search now, not a module-level
          mock array — so the sheet's "Show N ads" footer reads against an
          empty list here and simply says "Show 0 ads" until you apply and
          land on the real feed. */}
      <FilterSheet
        open={sheetOpen}
        filters={filters}
        listings={[]}
        query={query}
        initialGroup="category"
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
          navigate("/browse");
        }}
      />
    </>
  );
}
