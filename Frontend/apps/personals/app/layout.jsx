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
    // Discreet mode sets a browser-only attribute before hydration.
    <html lang="en" data-theme="personals" suppressHydrationWarning>
      <body>
        <Script id="discreet-init" strategy="beforeInteractive">
          {DISCREET_INIT_SCRIPT}
        </Script>
        <Providers>
          <AgeGate>{children}</AgeGate>
        </Providers>
      </body>
    </html>
  );
}
