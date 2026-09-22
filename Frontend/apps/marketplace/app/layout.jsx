import "@vezlist/shared/index.css";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";
import Providers from "./providers";

const DESCRIPTION = "Buy, sell and hire across Canada. Post an ad in minutes.";

export const metadata = {
  metadataBase: new URL(MARKETPLACE_URL),
  title: {
    default: "Vezlist — Post, Promote, Grow.",
    template: "%s · Vezlist",
  },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Vezlist — Post, Promote, Grow.",
    description: DESCRIPTION,
    url: MARKETPLACE_URL,
    siteName: "Vezlist",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vezlist — Post, Promote, Grow.",
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
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
