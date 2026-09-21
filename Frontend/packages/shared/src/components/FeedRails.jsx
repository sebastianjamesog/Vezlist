"use client";

import Link from "next/link";
import MediaImage from "./media/MediaImage.jsx";

/**
 * The two rails that bracket a feed: shortcuts above it, promos below it.
 *
 * Both sites draw them, neither site's version says the same thing — personals
 * shortcuts you to a broadcast, the marketplace to a price bracket — so the
 * items are a prop and only the shape lives here.
 */

/* -------------------------------------------------------------------------
   Shortcuts
------------------------------------------------------------------------- */

/**
 * The four faces of one accent.
 *
 * Split into four maps rather than derived from one, because Tailwind reads
 * this file as text: a class assembled at runtime out of `${accent}-700` is a
 * class the compiler never sees and therefore never emits. Every value here is
 * a literal for that reason, and adding a hue means adding a row to each of the
 * four rather than one clever entry to a single one.
 */
const ACCENT_RING = {
  brand: "ring-brand/40",
  "brand-2": "ring-brand-2/40",
  rose: "ring-rose-200",
  green: "ring-emerald-200",
  purple: "ring-violet-200",
  amber: "ring-amber-200",
};

const ACCENT_TEXT = {
  brand: "text-brand",
  // --brand-2 is a gradient stop, not a text colour: #38bdf8 on white is
  // ~2.14:1, and even the personals theme's darker override only reaches
  // ~4.10:1. sky-700 clears 3:1 (icons) and 4.5:1 (text) on white
  // (~5.93:1), the marketplace canvas (~5.42:1) and the personals canvas
  // (~5.36:1) alike, so it works as this icon's colour on both themes
  // without touching the shared --brand-2 token gradients depend on.
  "brand-2": "text-sky-700",
  // The four below carry the stat line, which is real 11px text and not just
  // an icon, so they are held to the same bar the note above sets and for the
  // same reason. The -700 step is where each of them clears it: rose 6.06:1,
  // violet 7.29:1, emerald 5.37:1, amber 5.05:1 on white --surface, and
  // 5.47 / 6.58 / 4.85 / 4.56 on the personals canvas, the darker of the two
  // boards. The -600 steps do not — amber-600 is 3.19:1 on white, a heading
  // colour at best and a lie at 11px — so this map does not offer them.
  rose: "text-rose-700",
  green: "text-emerald-700",
  purple: "text-violet-700",
  amber: "text-amber-700",
};

/**
 * The 3px rule across the top of a tile.
 *
 * It is the whole reason the redesigned rail reads as a set of separate
 * measurements rather than one grey texture: five white cards with five tinted
 * icons still scan as one block, five white cards each capped by its own colour
 * do not. Decorative, and no text sits on it, so this is the one place an accent
 * is allowed to be bright — the contrast rules above govern lettering, and there
 * is none here.
 */
const ACCENT_RULE = {
  brand: "from-brand",
  "brand-2": "from-sky-500",
  rose: "from-rose-500",
  green: "from-emerald-500",
  purple: "from-violet-500",
  amber: "from-amber-500",
};

/** The filled dot: the `dot` variant's glyph, and the count pill's marker. */
const ACCENT_DOT = {
  brand: "bg-brand",
  "brand-2": "bg-sky-600",
  rose: "bg-rose-500",
  green: "bg-emerald-500",
  purple: "bg-violet-500",
  amber: "bg-amber-500",
};

/**
 * One tile. A tile with an `href` is a way somewhere else; a tile with a
 * `patch` re-cuts the feed underneath it and lights up while that cut is on.
 *
 * It carries a number now, and the number is the point: a rail of five words
 * tells you where you could go, a rail of five measurements tells you whether
 * going is worth it. `stat` is that measurement, and every caller derives it
 * from the same data its destination renders — none of them is allowed to be a
 * hand-typed constant that drifts away from the board. `sub` is what a tile
 * falls back to when it honestly has no number to give ("Find nearby"), and it
 * stays muted so a description and a measurement are never confused at a
 * glance.
 *
 * Those measurements describe the *board*, not the reader's current cut of it.
 * Deliberately: a rail whose numbers moved on every chip tap would invite you
 * to watch the rail instead of the results underneath it, and the question
 * these tiles answer — "is there anything over there" — is asked before you
 * have narrowed anything.
 *
 * Everything under the label is optional, and every combination has to leave
 * the tiles the same height, which is why the rail leaves its children
 * stretched and the footer is pushed down with `mt-auto` rather than each tile
 * sizing itself to whatever it happens to carry.
 */
function Shortcut({ item, active, onPatch }) {
  const { Icon, label, sub, stat, accent, pill, dot, thumbs, count } = item;
  const hue = accent ?? "brand";
  const tint = ACCENT_TEXT[hue] ?? ACCENT_TEXT.brand;
  const rule = ACCENT_RULE[hue] ?? ACCENT_RULE.brand;
  const marker = ACCENT_DOT[hue] ?? ACCENT_DOT.brand;

  const body = (
    <>
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r to-transparent ${rule}`}
      />

      {/* The pill sits beside the icon now rather than replacing it. It used to
          replace it, which spent the one mark that says what kind of thing the
          tile is on a badge that says "new" — and now that the icon is what
          ties the tile to the coloured rule above it, dropping it leaves a
          stripe belonging to nothing. */}
      <span className="flex w-full items-center justify-between gap-1">
        {dot ? (
          // A filled dot instead of a glyph, for a tile whose subject is
          // presence rather than a category — there is no icon for "here right
          // now" that is not already a metaphor for something else. It keeps
          // the glyph's box so a rail mixing the two does not step up and down.
          <span className="grid size-[18px] shrink-0 place-items-center">
            <span className={`size-2.5 rounded-full ${marker}`} />
          </span>
        ) : (
          <Icon className={`size-[18px] shrink-0 ${tint}`} strokeWidth={2.2} />
        )}
        {pill ? (
          <span className="inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.08em] text-brand-strong">
            {pill}
          </span>
        ) : null}
      </span>

      <span className="mt-1 block w-full truncate text-left text-[13px] font-bold leading-tight text-ink">
        {label}
      </span>
      <span
        className={`mt-0.5 block w-full truncate text-left text-[11px] font-semibold leading-tight ${
          stat ? tint : "text-muted"
        }`}
      >
        {stat ?? sub}
      </span>

      {/* Faces when the tile can show you *which* things it counts, a count
          pill when what it counts only exists on the screen it opens, and
          nothing at all when it honestly has neither. */}
      {thumbs?.length > 0 ? (
        <span className="mt-auto flex w-full -space-x-2 pt-1.5">
          {thumbs.slice(0, 4).map((src, i) => (
            <span
              key={`${src}-${i}`}
              className="relative size-5 shrink-0 overflow-hidden rounded-full ring-2 ring-surface"
            >
              {/* The same call `Promo`'s stack below makes, for the same
                  reason: the wrapper reserves the box, so the rail is laid out
                  before a single photo has arrived and does not shift when they
                  do. `discreet` unconditionally, as `Promo` does — this rail is
                  shared and the personals board's photos ride through it, and a
                  shared component withholds by default or not at all. */}
              <MediaImage discreet fill src={src} alt="" sizes="24px" />
            </span>
          ))}
        </span>
      ) : count != null ? (
        <span className="mt-auto pt-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-ink">
            <span className={`size-1.5 rounded-full ${marker}`} />
            {count}
          </span>
        </span>
      ) : null}
    </>
  );

  // Tighter than it was by roughly a fifth of its height: the rail is a
  // signpost above the board, and it was tall enough to push the first real
  // listing off a phone screen. Every reduction is padding, leading and the
  // face stack — nothing that carries meaning got smaller, and `mt-auto` on
  // the footer still holds the tiles level whatever each one happens to hold.
  const shell = `relative flex w-[112px] shrink-0 flex-col items-start overflow-hidden rounded-2xl bg-surface px-2.5 pb-2 pt-2.5 text-left shadow-card ring-1 transition-transform hover:-translate-y-0.5 active:scale-95 ${
    active ? "ring-brand" : (ACCENT_RING[hue] ?? "ring-line")
  }`;

  if (item.href) {
    // A cross-site tile is a real navigation, not a route change.
    return item.external ? (
      <a href={item.href} className={shell}>
        {body}
      </a>
    ) : (
      <Link href={item.href} className={shell}>
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onPatch(item.patch)}
      className={shell}
    >
      {body}
    </button>
  );
}

/**
 * The rail bleeds to both screen edges so the last tile is half-visible and
 * reads as "there is more" rather than as the end.
 *
 * There is deliberately no `items-*` on it: the flex default, stretch, is what
 * keeps a tile carrying a thumbnail stack and a tile carrying nothing below its
 * stat line the same height, without either of them having to know what the
 * others hold.
 */
export function Shortcuts({ items, filters, onPatch, className = "" }) {
  // A tile lights up while the cut it applies is the one on screen. Tapping it
  // again is a no-op rather than a toggle — clearing is what the chips are for.
  const isActive = (item) =>
    !!item.patch &&
    Object.entries(item.patch).every(([k, v]) => filters[k] === v);

  return (
    <div
      className={`no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0 ${className}`}
    >
      {items.map((item) => (
        <Shortcut
          key={item.id}
          item={item}
          active={isActive(item)}
          onPatch={onPatch}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Promos
------------------------------------------------------------------------- */

function Promo({
  Icon,
  iconClass,
  title,
  sub,
  cta,
  ctaClass,
  onClick,
  thumbs,
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface p-2.5 shadow-card ring-1 ring-line">
      <Icon className={`size-6 shrink-0 ${iconClass}`} strokeWidth={1.9} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-ink">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-tight text-muted">
          {sub}
        </p>
        <button
          type="button"
          onClick={onClick}
          className={`mt-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold transition-transform active:scale-95 ${ctaClass}`}
        >
          {cta}
        </button>
      </div>

      {thumbs?.length > 0 && (
        <div className="flex shrink-0 -space-x-1.5">
          {thumbs.slice(0, 3).map((src) => (
            <span
              key={src}
              className="relative size-8 overflow-hidden rounded-lg ring-2 ring-surface"
            >
              <MediaImage discreet fill src={src} alt="" sizes="32px" />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The pair that closes the feed. They sit at the bottom because both are
 * things to do *after* you have read the board, not instead of reading it.
 *
 * Side by side even on the narrowest phone, and unevenly: the second card
 * carries a thumbnail stack, so it takes the wider half rather than squeezing
 * the stack down to nothing for the sake of a tidy 50/50.
 */
export function Promos({ cards, className = "" }) {
  return (
    <div className={`grid grid-cols-[1fr_1.45fr] gap-2 ${className}`}>
      {cards.map((card) => (
        <Promo key={card.id} {...card} />
      ))}
    </div>
  );
}
