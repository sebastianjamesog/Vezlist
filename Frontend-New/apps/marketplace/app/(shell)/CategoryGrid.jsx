"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Icon from "@vezlist/shared/components/ui/Icon.jsx";
import { categories, homeCategories } from "@vezlist/shared/data/mock.js";
import { PERSONALS_URL } from "@vezlist/shared/lib/sites.js";
import { tones } from "@vezlist/shared/lib/tones.js";

const byId = new Map(categories.map((c) => [c.id, c]));

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

export default function CategoryGrid({ className = "" }) {
  return (
    <nav
      aria-label={"Browse categories"}
      className={`grid grid-cols-3 gap-2.5 ${className}`}
    >
      {homeCategories.map((id) => {
        const personals = id === "personals";
        // "personals" is not in the taxonomy — it is the other site — so it
        // brings its own icon and its label comes from the dictionary alone.
        const cat = personals
          ? { label: "Personals", icon: "VenusAndMars" }
          : byId.get(id);
        const Root = personals ? "a" : Link;
        // The mock data's English label is the fallback: a category added to
        // the taxonomy and not yet to the dictionaries shows up in English
        // rather than as a blank tile or a raw key.
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
            className={`group relative flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-card px-2 py-1.5 shadow-card lg:min-h-[124px] lg:gap-2.5 lg:py-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lift active:scale-[0.98] ${
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
              className={`grid size-10 shrink-0 place-items-center rounded-2xl lg:size-12 ${tones[TONE[id]] ?? tones.slate}`}
            >
              <Icon
                name={cat.icon}
                className="size-5 lg:size-6"
                strokeWidth={2.1}
              />
            </span>

            {/* The label sits in a box two lines tall whatever it says, so
                every tile in the grid is the same height whether its name runs
                to one line ("Jobs") or two ("Fashion & Clothing"). The clamp
                cannot centre its own text — it needs display:-webkit-box — so
                the fixed box does it instead. */}
            <span className="flex h-[30px] w-full items-center justify-center lg:h-[34px]">
              <span
                className={`line-clamp-2 text-center text-[12px] font-semibold leading-tight lg:text-[13px] ${
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
