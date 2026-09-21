/**
 * Next's file convention: this auto-links a `<link rel="manifest">` into
 * every page's `<head>` — no import into layout.jsx needed. Answers the
 * comment on index.css:51-52 ("a PWA installed to the home screen"), which
 * until now had nothing behind it making that possible.
 *
 * `theme_color` / `background_color` are the `[data-theme="personals"]`
 * `--brand` / `--canvas` tokens from index.css, restated as plain hex — a
 * manifest can't read CSS custom properties, and this file doesn't own that
 * file. `robots.js` in this app already opts the origin out of search
 * indexing; a home-screen install is a separate question from indexing and
 * this manifest doesn't change that answer.
 */
export default function manifest() {
  return {
    name: "Vezlist Personals — Adults only",
    short_name: "Personals",
    description: "Adults-only personals board. 18+.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef4fb",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
