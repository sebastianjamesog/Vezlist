import { Inter } from "next/font/google";
import "@vezlist/shared/index.css";
import { MARKETPLACE_URL, PERSONALS_URL } from "@vezlist/shared/lib/sites.js";
import Providers from "./providers";

// Self-hosted and subset by next/font: no render-blocking request to a
// third-party origin, and no layout shift when the face swaps in.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(MARKETPLACE_URL),
  title: {
    default: "Vezlist — Post, Promote, Grow.",
    template: "%s · Vezlist",
  },
  description: "Buy, sell and hire across Canada. Post an ad in minutes.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
