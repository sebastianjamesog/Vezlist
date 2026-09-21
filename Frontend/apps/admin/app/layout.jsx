import { Inter } from "next/font/google";
import "@vezlist/shared/index.css";
import { ADMIN_URL } from "@vezlist/shared/lib/sites.js";
import Providers from "./providers";

// Self-hosted and subset by next/font: no render-blocking request to a
// third-party origin, and no layout shift when the face swaps in.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const DESCRIPTION = "Moderation and configuration for both Vezlist boards.";

export const metadata = {
  metadataBase: new URL(ADMIN_URL),
  title: {
    default: "Vezlist Console",
    template: "%s · Vezlist Console",
  },
  description: DESCRIPTION,
  // Nothing here should ever appear in a search result. The console is not
  // secret — it is behind a session — but it has no business being indexed.
  robots: { index: false, follow: false },
  alternates: { canonical: "/" },
  openGraph: {
    title: "Vezlist Console",
    description: DESCRIPTION,
    url: ADMIN_URL,
    siteName: "Vezlist Console",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Vezlist Console",
    description: DESCRIPTION,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      {/* The public sites float a phone mockup on a neutral desk below lg; a
          console is a desktop app at every width, so it paints the canvas
          itself rather than inheriting that backdrop. */}
      <body className="bg-canvas">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
