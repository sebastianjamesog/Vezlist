import { Inter } from "next/font/google";
import "@vezlist/shared/index.css";
import { MARKETPLACE_URL, PERSONALS_URL } from "@vezlist/shared/lib/sites.js";
import Providers from "./providers";
import AgeGate from "./AgeGate";

// Self-hosted and subset by next/font: no render-blocking request to a
// third-party origin, and no layout shift when the face swaps in.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(PERSONALS_URL),
  title: {
    default: "Vezlist Personals — Adults only",
    template: "%s · Personals",
  },
  description: "Adults-only personals board. 18+.",
  robots: { index: false, follow: false },
  other: { rating: "adult, RTA-5042-1996-1400-1577-RTA" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="personals" className={inter.variable}>
      <body>
        <Providers>
          <AgeGate>{children}</AgeGate>
        </Providers>
      </body>
    </html>
  );
}
