"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Icon from "@vezlist/shared/components/ui/Icon.jsx";
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
import { PERSONALS_URL } from "@vezlist/shared/lib/sites.js";
import { tones } from "@vezlist/shared/lib/tones.js";

/**
 * The nine doorways on the home screen, and the loudest thing on it.
 *
 * They used to be nine identical white cards with a blue glyph on each, which
 * made them one texture rather than nine choices — the eye had to read every
 * label to find anything, because nothing else on a tile carried information.
 * Each one now wears a tone chip behind its icon, from the same seven-colour
 * set the ad detail sheets use, so the grid is scannable by colour before it is
 * scannable by word and a returning user reaches for a position rather than a
 * name.
 *
 * The colours are assigned by hand, not cycled: no two neighbours in the 3x3
 * share a hue, which is the only property that actually matters here and is not
 * one an index-modulo palette would give you. Nothing is encoded by colour
 * alone — every tile still carries its glyph and its full label — so the grid
 * reads the same to someone who cannot tell the amber from the orange.
 *
 * The height is a floor, not a fixed value, because the screen these sit on no
 * longer scrolls: it hands the grid whatever height is left after the hero, the
 * two controls and the button, and the three rows divide it. 88px is the floor
 * — icon chip, a six-pixel gap and a two-line label box, and nothing under that
 * fits — which is roughly what the shortest phone we support ends up with,
 * while a tall one stretches the same tiles past 130px. The whole tile is the
 * target, so even the floor is twice the 44px minimum. Auto rows rather than
 * `grid-rows-3` for the same reason the parent avoids `min-h-0`: auto rows
 * stretch into spare height but will not compress below their content, so a
 * viewport too short for the layout scrolls instead of losing a row.
 *
 * `line-clamp-2` over a fixed label box is what keeps "Fashion & Clothing" from
 * making its tile taller than the eight around it.
 *
 * Everything is a real link. A tile carries you into the feed already narrowed
 * to that category; Personals carries you off this site entirely, so it is an
 * <a> that survives a middle-click and not a router push.
 */

/**
 * Tone per category, in grid order. Personals keeps rose, which is the colour
 * its own site wears — that tile is a different *place*, not another filter,
 * and the palette is half of how it says so.
 */
const TONE = {
  vehicles: "blue",
  personals: "rose",
  "buy-sell": "green",
  property: "indigo",
  services: "amber",
  electronics: "purple",
  entertainment: "orange",
  jobs: "blue",
  fashion: "indigo",
};

const HOME_CATEGORY_IDS = [
  "vehicles",
  "personals",
  "buy-sell",
  "property",
  "services",
  "electronics",
  "entertainment",
  "jobs",
  "fashion",
];

export default function CategoryGrid({ className = "" }) {
  const { categories, taxonomyReady, taxonomyError, reloadTaxonomy } = useFeed();
  const byId = new Map(categories.map((category) => [category.id, category]));
  const items = HOME_CATEGORY_IDS.map((id) => id === "personals"
    ? { id, label: "Personals", icon: "VenusAndMars" }
    : byId.get(id)).filter(Boolean);
  if (taxonomyReady && taxonomyError) {
    return (
      <div role="alert" className="rounded-card bg-surface p-5 text-center shadow-card">
        <p>Categories could not be loaded.</p>
        <button type="button" className="mt-2 font-semibold text-brand underline" onClick={reloadTaxonomy}>
          Try again
        </button>
      </div>
    );
  }
  if (!taxonomyReady) {
    return <div role="status" className="rounded-card bg-surface p-5 text-center shadow-card">Loading categories…</div>;
  }
  return (
    <nav
      aria-label={"Browse categories"}
      className={`grid grid-cols-3 gap-3 ${className}`}
    >
      {items.map((cat) => {
        const id = cat.id;
        const personals = id === "personals";
        const Root = personals ? "a" : Link;
        const label = cat.label;

        return (
          <Root
            key={id}
            href={personals ? PERSONALS_URL : `/browse?cat=${id}`}
            // The one tile that leaves the origin says so out loud rather than
            // only in rose: the badge marks it 18+, the corner arrow is the
            // conventional "this goes elsewhere", and the accessible name spells
            // out the destination for anyone who gets neither.
            aria-label={
              personals
                ? "Personals — opens the 18+ board on personals.vezlist.cc"
                : undefined
            }
            className={`group relative flex min-h-[120px] flex-col items-center justify-center gap-2.5 rounded-[26px] px-2 py-3 shadow-card sm:min-h-[155px] sm:gap-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lift active:scale-[0.98] ${
              personals
                ? "bg-surface ring-1 ring-rose-200"
                : "bg-surface ring-1 ring-transparent"
            }`}
          >
            {personals && (
              <>
                <span className="absolute left-2 top-2 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-extrabold leading-none tracking-[0.04em] text-rose-700">
                  18+
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="absolute right-2 top-2 size-3.5 text-rose-400"
                  strokeWidth={2.6}
                />
              </>
            )}

            <span
              aria-hidden="true"
              className={`grid size-12 shrink-0 place-items-center rounded-2xl sm:size-[60px] ${tones[TONE[id]] ?? tones.slate}`}
            >
              <Icon
                name={cat.icon}
                className="size-6 sm:size-8"
                strokeWidth={2.1}
              />
            </span>

            {/* The label sits in a box two lines tall whatever it says, so
                every tile in the grid is the same height whether its name runs
                to one line ("Jobs") or two ("Fashion & Clothing"). The clamp
                cannot centre its own text — it needs display:-webkit-box — so
                the fixed box does it instead. */}
            <span className="flex h-[32px] w-full items-center justify-center sm:h-[38px]">
              <span
                className={`line-clamp-2 text-center text-[12px] font-semibold leading-tight sm:text-[16px] ${
                  personals ? "text-rose-700" : "text-ink"
                }`}
              >
                {label}
              </span>
            </span>
          </Root>
        );
      })}
    </nav>
  );
}
