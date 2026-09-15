import L from "leaflet";
import { prefersReducedMotion } from "./geo.js";

/**
 * The markers, as HTML.
 *
 * A Leaflet marker is not a React tree — `L.divIcon` takes a string of HTML and
 * Leaflet inserts it into a pane it owns. So everything here is built by string
 * concatenation, which has two consequences worth stating out loud:
 *
 *  1. Every value that reaches the markup is escaped. The listing titles and
 *     image URLs are mock data today and would be user input tomorrow, and a
 *     marker is exactly the sort of place an unescaped apostrophe quietly ends
 *     an attribute.
 *  2. The glyphs are inline `<path>` data rather than lucide components or
 *     emoji. lucide renders React and cannot be stringified here; emoji depend
 *     on a font the browser may not ship, which on a 12px badge is the
 *     difference between a category and a tofu box.
 */

/**
 * Category glyphs, keyed by `categoryId`.
 *
 * Deliberately fewer glyphs than the taxonomy has categories. The badge renders
 * at twelve pixels: "Digital" and "Electronics" are not distinguishable at that
 * size no matter how much path data is spent on them, so near-neighbours share
 * a mark and the ones that read differently at a glance — a car, a house, a
 * heart — get their own. Every path is filled with `fill-rule="evenodd"`, which
 * is what turns the second sub-path of the briefcase and the tag into a hole
 * rather than a smear.
 */
const glyphs = {
  house: "M12 3 2 12h3v8h5v-5h4v5h5v-8h3L12 3Z",
  briefcase:
    "M9 4h6a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3V6a2 2 0 0 1 2-2Zm0 3h6V6H9v1Z",
  car: "M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM3 15v-2l2-5h14l2 5v2h-2a3 3 0 0 0-6 0h-2a3 3 0 0 0-6 0H3Z",
  heart:
    "M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z",
  monitor:
    "M3 4h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
  tag: "M11 2H4a2 2 0 0 0-2 2v7l11 11 9-9L11 2Zm-4 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z",
  building:
    "M4 3h9a1 1 0 0 1 1 1v6h6a1 1 0 0 1 1 1v10H3V4a1 1 0 0 1 1-1Zm2 3v2h2V6H6Zm4 0v2h2V6h-2ZM6 10v2h2v-2H6Zm4 0v2h2v-2h-2Zm-4 4v2h2v-2H6Zm4 0v2h2v-2h-2Zm6 0v2h2v-2h-2Zm0 4v2h2v-2h-2Z",
  shirt: "M8 2 4 4 2 9l3 1.5V22h14V10.5L22 9l-2-5-4-2a4 4 0 0 1-8 0Z",
  dumbbell:
    "M2 10h2v4H2v-4Zm3-2h3v8H5V8Zm4 3h6v2H9v-2Zm7-3h3v8h-3V8Zm4 2h2v4h-2v-4Z",
  paw: "M5.5 12a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm13 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM9.5 8a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm5 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM12 12c3 0 6 2.5 6 5.3 0 2-1.6 2.9-3.3 2.4-1.8-.6-3.6-.6-5.4 0C7.6 20.2 6 19.3 6 17.3 6 14.5 9 12 12 12Z",
  gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 5.6-1.9-1.1a7.6 7.6 0 0 0 0-1l1.9-1.1a.8.8 0 0 0 .3-1l-1.8-3.1a.8.8 0 0 0-1-.3l-1.9 1.1a7.6 7.6 0 0 0-.9-.5V4.4a.8.8 0 0 0-.8-.8h-3.6a.8.8 0 0 0-.8.8v2.2q-.5.2-.9.5L7.1 6a.8.8 0 0 0-1 .3L4.3 9.4a.8.8 0 0 0 .3 1l1.9 1.1a7.6 7.6 0 0 0 0 1l-1.9 1.1a.8.8 0 0 0-.3 1l1.8 3.1a.8.8 0 0 0 1 .3l1.9-1.1q.4.3.9.5v2.2c0 .4.4.8.8.8h3.6c.4 0 .8-.4.8-.8v-2.2q.5-.2.9-.5l1.9 1.1a.8.8 0 0 0 1-.3l1.8-3.1a.8.8 0 0 0-.3-1Z",
  calendar:
    "M7 2v2h10V2h2v2h2a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2V2h2Zm13 8H4v10h16V10Z",
  ticket: "M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Z",
  book: "M4 4a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V4Zm2 16h13v2H6a1 1 0 0 1 0-2Z",
  plane:
    "M21 14 13 9V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5l8 2.5v-2Z",
  landmark:
    "M12 2 2 8v2h20V8L12 2ZM4 12h2v6H4v-6Zm5 0h2v6H9v-6Zm5 0h2v6h-2v-6Zm5 0h2v6h-2v-6ZM2 20h20v2H2v-2Z",
};

/** `categoryId` → glyph. Anything unmapped falls back to the price tag. */
const glyphByCategory = {
  vehicles: "car",
  jobs: "briefcase",
  services: "gear",
  tools: "gear",
  electronics: "monitor",
  digital: "monitor",
  "buy-sell": "tag",
  property: "building",
  business: "building",
  fashion: "shirt",
  "home-garden": "house",
  pets: "paw",
  fitness: "dumbbell",
  entertainment: "ticket",
  education: "book",
  events: "calendar",
  travel: "plane",
  antiques: "landmark",
  dating: "heart",
  personals: "heart",
};

const glyphPath = (categoryId) =>
  glyphs[glyphByCategory[categoryId] ?? "tag"] ?? glyphs.tag;

/** Attribute-safe. See note 1 at the top of the file. */
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const badge = (categoryId) =>
  `<span class="vz-pin__badge"><svg viewBox="0 0 24 24" width="12" height="12" fill="#fff" fill-rule="evenodd" aria-hidden="true"><path d="${glyphPath(
    categoryId,
  )}"/></svg></span>`;

// The photo is decorative *inside the marker*: the accessible name comes from
// Leaflet's own `alt`/`title` options on the Marker, so an empty alt here
// avoids announcing the same listing twice.
const photo = (src) =>
  `<img src="${esc(src)}" alt="" decoding="async" draggable="false"/>`;

/**
 * One listing, as a white speech bubble holding its photo, with the category
 * badge notched into the bottom-right corner and a tail pointing at the exact
 * coordinate.
 */
function buildPinHtml(listing, { selected, animate }) {
  const classes = [
    "vz-pin",
    selected ? "vz-pin--selected" : "",
    animate ? "vz-pin--enter" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<div class="${classes}"><span class="vz-pin__tail"></span><span class="vz-pin__frame">${photo(
    listing.image,
  )}</span>${badge(listing.categoryId)}</div>`;
}

/**
 * Several listings that would otherwise sit on top of each other, as a mosaic.
 *
 * Up to three photos plus a `+N` overflow tile. A cluster of exactly four shows
 * four photos and no tile — a `+0` is worse than nothing — and a cluster of
 * three fills its empty fourth cell with a flat brand tint so the grid still
 * reads as a deliberate mosaic rather than as a photo that failed to load.
 */
function buildClusterHtml(members, { animate }) {
  const total = members.length;
  const shown = total <= 4 ? members : members.slice(0, 3);
  const overflow = total - shown.length;

  const cells = shown.map((m) => `<span>${photo(m.listing.image)}</span>`);
  if (overflow > 0)
    cells.push(`<span class="vz-cluster__more">+${overflow}</span>`);
  else if (shown.length === 3)
    cells.push(`<span class="vz-cluster__fill"></span>`);

  const classes = [
    "vz-cluster",
    total === 2 ? "vz-cluster--pair" : "",
    animate ? "vz-pin--enter" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<div class="${classes}"><span class="vz-pin__tail"></span><span class="vz-cluster__grid">${cells.join(
    "",
  )}</span></div>`;
}

/**
 * Icons are cached, not rebuilt.
 *
 * react-leaflet calls `marker.setIcon()` whenever the `icon` prop is a new
 * object, and `setIcon` throws away the marker's DOM element and builds another
 * one — so handing it a freshly constructed `L.divIcon` on every render would
 * re-download nothing (the browser has the photo) but would restart every
 * transition and pull the element out from under a hover. Keying on a signature
 * that covers everything the markup depends on means a marker keeps the same
 * element until something about it genuinely changed.
 *
 * The cache is dropped wholesale past a few hundred entries rather than being a
 * real LRU: cluster keys depend on which pins happen to share a cell, so the key
 * space grows while panning, and the cost of a cold rebuild here is one string.
 */
const iconCache = new Map();
const CACHE_LIMIT = 300;

function cached(key, build) {
  const hit = iconCache.get(key);
  if (hit) return hit;
  if (iconCache.size > CACHE_LIMIT) iconCache.clear();
  const icon = build();
  iconCache.set(key, icon);
  return icon;
}

export function pinIcon(point, { selected = false } = {}) {
  const animate = !prefersReducedMotion();
  return cached(`pin:${point.id}:${selected ? 1 : 0}:${animate ? 1 : 0}`, () =>
    L.divIcon({
      className: "vz-marker",
      // A 56px bubble plus an 8px tail; the anchor is the tail's tip, so the pin
      // points at its coordinate instead of sitting on top of it.
      iconSize: [56, 64],
      iconAnchor: [28, 64],
      html: buildPinHtml(point.listing, { selected, animate }),
    }),
  );
}

export function clusterIcon(cluster) {
  const animate = !prefersReducedMotion();
  const key = `cluster:${cluster.members.length}:${cluster.members
    .slice(0, 4)
    .map((m) => m.id)
    .join(",")}:${animate ? 1 : 0}`;

  return cached(key, () =>
    L.divIcon({
      className: "vz-marker",
      iconSize: [64, 72],
      iconAnchor: [32, 72],
      html: buildClusterHtml(cluster.members, { animate }),
    }),
  );
}

/**
 * The marker stylesheet.
 *
 * It lives here rather than in `index.css` because it is inseparable from the
 * HTML above — the two are one component that happens to be split across a
 * string and a rule set — and because `index.css` is shared by every screen in
 * both apps while these class names are only ever produced by this file.
 * `MapView` renders it in a `<style>` tag; two maps on one page would emit it
 * twice, which is harmless because the rules are identical.
 *
 * There is no `prefers-reduced-motion` block here: the entrance animation is
 * simply not emitted when the query matches (see `prefersReducedMotion`), which
 * is a better result than letting the global rule in `index.css` clip the
 * keyframe to 0.01ms — a squashed keyframe flickers rather than stops.
 */
export const MARKER_CSS = `
.vz-marker { background: none; border: 0; }
.vz-pin, .vz-cluster { position: relative; cursor: pointer; }
.vz-pin { width: 56px; height: 64px; }
.vz-cluster { width: 64px; height: 72px; }

.vz-pin__frame, .vz-cluster__grid {
  position: absolute; top: 0; left: 0; right: 0; z-index: 2;
  display: block; background: #fff; padding: 3px;
  box-shadow: 0 0 0 1px rgb(11 18 32 / .07), 0 8px 18px -8px rgb(11 18 32 / .55);
  transition: transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 160ms ease;
}
.vz-pin__frame { height: 56px; border-radius: 18px; }
.vz-cluster__grid {
  height: 64px; border-radius: 20px;
  display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 2px;
}
.vz-cluster--pair .vz-cluster__grid { grid-template-rows: 1fr; }

.vz-pin__frame img { width: 100%; height: 100%; border-radius: 15px; object-fit: cover; display: block; }
.vz-cluster__grid > span { overflow: hidden; border-radius: 7px; }
.vz-cluster__grid img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vz-cluster__more {
  display: grid; place-items: center; background: var(--ink, #0b1220); color: #fff;
  font-size: 12px; font-weight: 700; letter-spacing: -.02em;
}
.vz-cluster__fill { background: var(--brand-soft, #eff6ff); }

/* The tail: a rotated square tucked under the bubble. Only its bottom point
   escapes; the bubble paints over the rest. */
.vz-pin__tail {
  position: absolute; left: 50%; z-index: 1;
  width: 16px; height: 16px; margin-left: -8px;
  background: #fff; border-radius: 0 0 3px 0; transform: rotate(45deg);
  box-shadow: 3px 3px 10px -5px rgb(11 18 32 / .6);
}
.vz-pin .vz-pin__tail { top: 46px; }
.vz-cluster .vz-pin__tail { top: 54px; }

.vz-pin__badge {
  position: absolute; right: -3px; top: 36px; z-index: 3;
  display: grid; place-items: center; width: 23px; height: 23px;
  border-radius: 9px; background: var(--ink, #0b1220);
  box-shadow: 0 0 0 2.5px #fff;
}

.vz-marker:hover .vz-pin__frame,
.vz-marker:hover .vz-cluster__grid { transform: translateY(-3px); }
.vz-marker:focus-visible { outline: none; }
.vz-marker:focus-visible .vz-pin__frame,
.vz-marker:focus-visible .vz-cluster__grid,
.vz-pin--selected .vz-pin__frame {
  box-shadow: 0 0 0 3px var(--brand, #2563eb), 0 10px 22px -8px rgb(11 18 32 / .6);
}
.vz-pin--selected { z-index: 5; }
.vz-pin--selected .vz-pin__frame { transform: translateY(-3px) scale(1.04); }

.vz-pin--enter { animation: vz-pin-in 220ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes vz-pin-in {
  from { opacity: 0; transform: translateY(6px) scale(.82); }
  to { opacity: 1; transform: none; }
}
`;
