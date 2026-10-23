import "@vezlist/shared/index.css";
import "./admin-theme.css";
import Script from "next/script";
import { ADMIN_THEME_INIT } from "@vezlist/shared/lib/adminTheme.js";
import { ADMIN_URL } from "@vezlist/shared/lib/sites.js";
import Providers from "./providers";

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
    <html lang="en" data-admin-theme="light" suppressHydrationWarning>
      {/* The public sites float a phone mockup on a neutral desk below lg; a
          console is a desktop app at every width, so it paints the canvas
          itself rather than inheriting that backdrop. */}
      <body className="bg-canvas">
        <Script id="admin-theme-init" strategy="beforeInteractive">
          {ADMIN_THEME_INIT}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
