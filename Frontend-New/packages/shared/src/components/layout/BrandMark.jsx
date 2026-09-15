"use client";

import { SITE_NAME } from "../../lib/sites";

/**
 * The mark: the blue app-icon tile with the initial in it, and the only
 * definition of it in the codebase.
 *
 * This file used to hold something else entirely — the chevron silhouette out
 * of `app/icon.svg`, filled with a two-stop gradient and hung off a `useId`
 * so two of them on one screen would not fight over a `<defs>` id. It was
 * careful work about the wrong shape. The real logo is not a chevron: it is a
 * rounded square wearing the brand gradient with a white "V" centred in it,
 * set beside the wordmark. So the chevron, its gradient and the id machinery
 * are gone, and what is left is the tile `Wordmark` had already been drawing
 * by hand — moved here so the two cannot drift apart, because a logo defined
 * twice is a logo that eventually renders two ways.
 *
 * The letter is `SITE_NAME[0]`, never a literal "V". The same bundle builds
 * the personals board and the console, and hardcoding the marketplace's
 * initial would put a V on a tile next to the word "Personals".
 *
 * Everything about the colour comes from the `brand-gradient` utility and the
 * `--shadow-pop` token, so this comes out blue on the marketplace and deeper
 * blue on personals with no stylesheet of its own and nothing to keep in step.
 *
 * ── Why the geometry is in a style attribute ────────────────────────────────
 *
 * The caller sizes the tile, and one caller — the marketplace launcher —
 * sizes it *responsively*, `size-9 lg:size-11`. Two of the tile's three
 * measurements have to follow that, and neither can be written as a fixed
 * class:
 *
 *   - The corner radius. `rounded-xl` is judged against a 36px box; on a 44px
 *     one the same 12px reads under-rounded. `Wordmark` used to solve this by
 *     switching to `rounded-[14px]` with its `size` prop, which works only
 *     because it has exactly two sizes and knows both at render time. A
 *     percentage radius is the same two numbers (12/36 and 14/44 are 33% and
 *     32%) expressed once, and it keeps tracking at any size a caller invents,
 *     including one that changes at a breakpoint.
 *   - The letter. Likewise 18px in a 36px tile and 22px in a 44px one: half
 *     the width, both times. `cqw` against the tile's own container is that
 *     ratio written down, so the glyph grows with the box instead of being
 *     restated per size.
 *
 * They are inline rather than arbitrary Tailwind values because `cqw` is not a
 * unit Tailwind infers a property from, and splitting one two-line rule across
 * a class and a style attribute would be worse than keeping it together.
 *
 * `aria-hidden` deliberately: the mark never appears without the site's name
 * set beside it, and a reader that announced both would say it twice.
 */
export default function BrandMark({ className = "size-9" }) {
  return (
    <span
      aria-hidden="true"
      style={{ borderRadius: "32%", containerType: "inline-size" }}
      className={`brand-gradient grid shrink-0 place-items-center shadow-pop ${className}`}
    >
      <span
        style={{ fontSize: "50cqw" }}
        className="font-extrabold leading-none text-white"
      >
        {SITE_NAME[0]}
      </span>
    </span>
  );
}
