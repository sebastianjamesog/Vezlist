"use client";

import BrandMark from "./BrandMark";
import { SITE_NAME, SITE_TAGLINE } from "../../lib/sites";

/**
 * The lockup: mark, name, and at `lg` the tagline under it.
 *
 * The mark used to be drawn here — a `brand-gradient` span with `SITE_NAME[0]`
 * in it and a radius switched by hand between the two sizes. `BrandMark`
 * existed at the same time drawing something else, so the app shipped two
 * logos and the launcher was wearing the wrong one. The tile is `BrandMark`'s
 * now and this file only places it; `size` picks the box, and the radius and
 * the letter follow the box on their own inside the mark.
 *
 * `markOnly` is what the collapsed desktop rail uses, `nameOnly` is here for
 * the inverse, and the tagline rides with `lg` because that is the size the
 * lockup is given when it is introducing the place rather than labelling it.
 */
export default function Wordmark({
  size = "md",
  markOnly = false,
  nameOnly = false,
}) {
  const big = size === "lg";

  return (
    <div className="flex items-center gap-2.5">
      {!nameOnly && <BrandMark className={big ? "size-11" : "size-9"} />}

      {!markOnly && (
        <span className="leading-none">
          <span
            className={`block font-extrabold tracking-tight text-ink ${
              big ? "text-[24px]" : "text-[20px]"
            }`}
          >
            {SITE_NAME}
          </span>
          {big && (
            <span className="mt-1 block text-[11px] font-medium text-muted">
              {SITE_TAGLINE}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
