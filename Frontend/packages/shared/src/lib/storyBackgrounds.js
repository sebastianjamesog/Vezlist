/**
 * The colours a text story can sit on.
 *
 * Its own module rather than a second export from `StoryComposer.jsx`, for a
 * reason that is about the bundle and not about lint: `StatusViewer` needs
 * `backgroundCss` to paint a story somebody already posted, and importing it
 * from the composer would pull the whole composer — file inputs, the media
 * pipeline, `lib/media.js` and its decode path — into the player, which is the
 * one screen on this board that has to open instantly.
 *
 * Gradients rather than flat fills, and dark ones: the overlay text is white
 * with a shadow under it (see the composer and the player), and white on a
 * pale flat fill is the one combination that fails to read.
 */
export const STORY_BACKGROUNDS = [
  { id: "dusk", label: "Dusk", css: "linear-gradient(160deg,#4f46e5,#db2777)" },
  { id: "ink", label: "Ink", css: "linear-gradient(160deg,#0f172a,#334155)" },
  {
    id: "ember",
    label: "Ember",
    css: "linear-gradient(160deg,#f59e0b,#e11d48)",
  },
  { id: "moss", label: "Moss", css: "linear-gradient(160deg,#047857,#065f46)" },
  { id: "tide", label: "Tide", css: "linear-gradient(160deg,#0ea5e9,#1d4ed8)" },
];

export const DEFAULT_STORY_BACKGROUND = STORY_BACKGROUNDS[0].id;

/**
 * The CSS for a stored id, falling back to the first rather than to nothing.
 * An update written by an older build carries no `background` at all, and a
 * story that renders as a transparent hole is worse than one that renders in
 * the wrong colour.
 */
export const backgroundCss = (id) =>
  STORY_BACKGROUNDS.find((b) => b.id === id)?.css ?? STORY_BACKGROUNDS[0].css;
