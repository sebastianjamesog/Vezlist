/**
 * Next's file convention: this auto-links a `<link rel="manifest">` into
 * every page's `<head>` — no import into layout.jsx needed. Answers the
 * comment on index.css:51-52 ("a PWA installed to the home screen"), which
 * until now had nothing behind it making that possible.
 *
 * `theme_color` / `background_color` are the light-theme `--brand` /
 * `--canvas` tokens from index.css, restated as plain hex — a manifest
 * can't read CSS custom properties, and this file doesn't own that file.
 */
export default function manifest() {
  return {
    name: "Vezlist — Post, Promote, Grow.",
    short_name: "Vezlist",
    description: "Buy, sell and hire across Canada. Post an ad in minutes.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
