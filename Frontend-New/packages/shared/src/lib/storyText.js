/**
 * Where the words sit on a story, and what colour they are.
 *
 * Position is stored as a percentage of the canvas, never as pixels. The same
 * update is drawn in three different widths — the composer's canvas, the
 * player's 430px phone column and the 520px one it gets at `lg` — and a pixel
 * offset that looks right in one of those is wrong in the other two. A
 * percentage is the only thing that survives the trip.
 *
 * Its own module rather than an export from the composer so that
 * `StatusViewer` can read it without pulling the composer's file inputs and
 * media-decode path into the player's bundle. Same reasoning as
 * `storyBackgrounds.js`, which sits beside it.
 */

/** Dead centre, which is where a story with one line of text belongs. */
export const DEFAULT_TEXT_POSITION = { x: 50, y: 50 };

/**
 * The words are centred on their point, so a point at the very edge hangs
 * half of them outside the story. The margin is what keeps the whole line on
 * screen no matter where it is dropped.
 */
const MIN = 8;
const MAX = 92;

const clamp = (n) => Math.min(MAX, Math.max(MIN, n));

export function clampTextPosition(x, y) {
  return { x: clamp(x), y: clamp(y) };
}

/**
 * The position to draw a stored update at. An update written before text was
 * movable carries no `x`/`y` at all, and those should keep rendering where
 * they always did rather than collapsing into a corner.
 */
export function textPositionOf(update) {
  return clampTextPosition(
    typeof update?.x === "number" ? update.x : DEFAULT_TEXT_POSITION.x,
    typeof update?.y === "number" ? update.y : DEFAULT_TEXT_POSITION.y,
  );
}

/* --------------------------------------------------------------- colour */

/**
 * What the words can be written in.
 *
 * Each carries its own `shadow` rather than sharing one, and that is the
 * whole point of the table: the drop shadow is what keeps text legible over a
 * photograph, and a dark shadow under dark letters does nothing. White and
 * the bright accents get a black glow; black gets a white one, so it still
 * reads when somebody drops it on a dark photo.
 *
 * Kept deliberately short. A full colour wheel on a story editor produces
 * mostly unreadable stories, because the one thing it cannot offer is a
 * guarantee that the colour clears the picture behind it.
 */
export const STORY_TEXT_COLORS = [
  {
    id: "white",
    label: "White",
    css: "#ffffff",
    shadow: "0 2px 14px rgb(0 0 0 / 0.6)",
  },
  {
    id: "black",
    label: "Black",
    css: "#0b0b12",
    shadow: "0 2px 14px rgb(255 255 255 / 0.65)",
  },
  {
    id: "amber",
    label: "Amber",
    css: "#fbbf24",
    shadow: "0 2px 14px rgb(0 0 0 / 0.65)",
  },
  {
    id: "rose",
    label: "Rose",
    css: "#fb7185",
    shadow: "0 2px 14px rgb(0 0 0 / 0.65)",
  },
  {
    id: "sky",
    label: "Sky",
    css: "#38bdf8",
    shadow: "0 2px 14px rgb(0 0 0 / 0.65)",
  },
  {
    id: "mint",
    label: "Mint",
    css: "#34d399",
    shadow: "0 2px 14px rgb(0 0 0 / 0.65)",
  },
];

export const DEFAULT_TEXT_COLOR = STORY_TEXT_COLORS[0].id;

/**
 * The colour and shadow to draw a stored update in. Falls back to white for
 * an update written before colours existed, which is what those were drawn in
 * when they were posted.
 */
export function textColorOf(update) {
  return (
    STORY_TEXT_COLORS.find((c) => c.id === update?.color) ??
    STORY_TEXT_COLORS[0]
  );
}
