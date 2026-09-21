import { Inter } from "next/font/google";
import Script from "next/script";
import "@vezlist/shared/index.css";
import { PERSONALS_URL } from "@vezlist/shared/lib/sites.js";
import Providers from "./providers";
import AgeGate from "./AgeGate";

// Keep this key literal in sync with DISCREET_STORAGE_KEY in ./useDiscreet.js
// (a plain string, not re-imported here: this file stays a server component,
// and useDiscreet.js is "use client").
const DISCREET_STORAGE_KEY = "vezlist:discreet";

// Sets `data-discreet` on <html> before hydration — before React runs, before
// any photo has painted — so a returning visitor with discreet mode on never
// sees an unblurred frame first. `beforeInteractive` is injected into <head>
// and runs synchronously while the document is still parsing, ahead of the
// body it describes; a version of this that ran from a useEffect instead (the
// old behaviour) draws the real image, then blurs it a tick later, which is
// not discreet, it's delayed.
const DISCREET_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  DISCREET_STORAGE_KEY,
)});document.documentElement.dataset.discreet=(v==="1"||v==="true")?"on":"off";}catch(e){}})();`;

// Keep this key literal in sync with AGE_GATE_STORAGE_KEY in ./AgeGate.jsx.
const AGE_GATE_STORAGE_KEY = "vezlist:age-gate:v1";

/**
 * The same `beforeInteractive` trick as `DISCREET_INIT_SCRIPT`, run for the
 * opposite reason: `AgeGate.jsx`'s own state always starts a mount at "not
 * confirmed" (the safe default — see that file's doc comment on the flash, in
 * both directions), so without this, a *confirmed* returning visitor would
 * see the gate they already answered flash on screen for one tick before the
 * stored value catches up and React removes it.
 *
 * This script cannot `import` lib/age.js — it has to exist as a literal
 * string, executed before any module graph is loaded — so it carries a
 * deliberately duplicated copy of that file's `isConfirmedAdult`. It used to
 * duplicate a good deal more (a leap-year-safe date parser and an age
 * calculation, back when the gate asked for a date of birth); now that the
 * gate asks a single yes/no question, the whole check is "a plain object with
 * `confirmed === true`", and `!== true` is written out rather than a truthy
 * test so a hand-written `"confirmed":"yes"` fails here exactly as it fails
 * in `isConfirmedAdult`. `age.test.js` asserts that line still exists.
 *
 * A wrong guess here is never a security gap: it only sets a CSS-facing
 * attribute (see the `<style>` below), and AgeGate.jsx's own `useEffect`
 * overwrites that same attribute with the real, revalidated answer the
 * moment React has mounted — this script only has to get the *common* case
 * right to kill the flash; the true gate is still `isConfirmedAdult` running
 * against React state, same as if this script did not exist at all.
 */
const AGE_GATE_INIT_SCRIPT = `(function(){
  try {
    var raw = localStorage.getItem(${JSON.stringify(AGE_GATE_STORAGE_KEY)});
    if (!raw) return;
    var v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return;
    if (v.confirmed !== true) return;
    document.documentElement.dataset.ageGate = "ok";
  } catch (e) {}
})();`;

// Paired with AGE_GATE_INIT_SCRIPT: hides the gate's overlay the instant that
// script (or AgeGate.jsx's own post-hydration effect) marks the visitor
// confirmed, rather than waiting for React to unmount it. `#age-gate-overlay`
// is the id AgeGate.jsx puts on the dialog itself.
const AGE_GATE_CSS = `html[data-age-gate="ok"] #age-gate-overlay{display:none}`;

// Self-hosted and subset by next/font: no render-blocking request to a
// third-party origin, and no layout shift when the face swaps in.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const DESCRIPTION = "Adults-only personals board. 18+.";

export const metadata = {
  metadataBase: new URL(PERSONALS_URL),
  title: {
    default: "Vezlist Personals — Adults only",
    template: "%s · Personals",
  },
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  other: { rating: "adult, RTA-5042-1996-1400-1577-RTA" },
  alternates: { canonical: "/" },
  openGraph: {
    title: "Vezlist Personals — Adults only",
    description: DESCRIPTION,
    url: PERSONALS_URL,
    siteName: "Vezlist Personals",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vezlist Personals — Adults only",
    description: DESCRIPTION,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    // `suppressHydrationWarning`: the two `beforeInteractive` scripts below
    // write `data-discreet` and `data-age-gate` onto this element before React
    // hydrates, so the server HTML deliberately does not carry them and the
    // client DOM does. That is the documented Next pattern for a
    // flash-preventing init script, and the warning it silences is scoped to
    // this one element's attributes — children still diff normally.
    <html
      lang="en"
      data-theme="personals"
      className={inter.variable}
      suppressHydrationWarning
    >
      <body>
        <Script id="discreet-init" strategy="beforeInteractive">
          {DISCREET_INIT_SCRIPT}
        </Script>
        <Script id="age-gate-init" strategy="beforeInteractive">
          {AGE_GATE_INIT_SCRIPT}
        </Script>
        <style>{AGE_GATE_CSS}</style>
        <Providers>
          <AgeGate>{children}</AgeGate>
        </Providers>
      </body>
    </html>
  );
}
