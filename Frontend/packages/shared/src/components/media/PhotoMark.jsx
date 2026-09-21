"use client";

import { WATERMARK_TEXT } from "../../lib/media.js";

/**
 * The visible half of the watermark system.
 *
 * The real mark is burnt into the pixels in `lib/media.js`, at the one point
 * every uploaded photo passes through, and that is the one that matters: it
 * survives a right-click-save, a screenshot and a repost, because by then it
 * *is* the photo. This component is not that, and cannot be — anything drawn
 * in the DOM is gone the moment the file leaves the page.
 *
 * What it is for is the photos that never went through that pipeline: every
 * seeded row on both boards is a stock `https:` URL that was never picked,
 * never decoded and never re-encoded here, so it carries no burnt mark and
 * never will. Without this, the board demonstrates a watermark system by
 * showing you nothing at all, which is indistinguishable from it being
 * broken.
 *
 * Hence the one condition: a `data:` URI is a photo this app encoded, so it
 * already carries the real mark and gets nothing drawn over it — two marks in
 * the same corner is worse than either. Everything else is a photo we did not
 * make, and gets the overlay. That test is deliberately about *provenance*
 * (did our pipeline produce these bytes) rather than about looks, which is
 * why it keys on the scheme and not on the render site.
 *
 * Positioned by the caller's nearest `relative` ancestor and inert to the
 * pointer, so it never eats a tap meant for the photo underneath. `aria-hidden`
 * because it is a property of the image, not content: a screen reader
 * announcing "VEZLIST" between an ad's photo and its title is reading out
 * furniture.
 */
export default function PhotoMark({ src, className = "" }) {
  // A photo our own canvas encoded already has the mark in its pixels.
  if (typeof src === "string" && src.startsWith("data:")) return null;

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-1.5 right-2 select-none font-extrabold uppercase leading-none tracking-[0.08em] text-white/60 ${className}`}
      style={{
        // Matches the burnt-in mark's construction rather than approximating
        // it: a dark halo tight around the letterforms, so the word reads on a
        // bright sky and a dark interior alike without a scrim rectangle
        // sitting on someone's photo. Four offsets plus a soft shadow is the
        // CSS equivalent of the canvas `strokeText` underneath the fill.
        textShadow:
          "0 0 3px rgb(0 0 0 / 0.55), 0 1px 0 rgb(0 0 0 / 0.4), 1px 0 0 rgb(0 0 0 / 0.4), -1px 0 0 rgb(0 0 0 / 0.4), 0 -1px 0 rgb(0 0 0 / 0.4)",
      }}
    >
      {WATERMARK_TEXT}
    </span>
  );
}
