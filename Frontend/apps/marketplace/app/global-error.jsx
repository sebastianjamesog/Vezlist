"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { reportError } from "@vezlist/shared/lib/observability.js";
import { Inter } from "next/font/google";
import "@vezlist/shared/index.css";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";

// global-error replaces the root layout entirely when the layout itself
// throws, so it can't rely on anything layout.jsx normally provides — the
// stylesheet, the font, even <html>/<body> — and has to bring its own of
// each. `metadata` exports aren't supported in this file; <title> is
// React's documented stand-in, hoisted to <head> wherever it renders.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export default function GlobalError({ error, retry }) {
  useEffect(() => {
    // Same report, different scope: this one fires when the root layout
    // itself threw, so nothing below it — not even the theme — was standing.
    reportError(error, { scope: "global-boundary" });
  }, [error]);

  return (
    <html lang="en" className={inter.variable}>
      <body>
        <title>Something went wrong · Vezlist</title>
        <div className="grid min-h-dvh place-items-center px-6 py-16">
          <EmptyState
            icon="Wrench"
            title="Something went wrong"
            body="The app hit a snag loading. Try again, or come back in a moment."
            action={<Button onClick={() => retry()}>Try again</Button>}
          />
        </div>
      </body>
    </html>
  );
}
