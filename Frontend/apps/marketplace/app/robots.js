import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";

// The public board: organic search is the primary acquisition channel here,
// so crawlers get a full allow plus a pointer at the generated sitemap.
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${MARKETPLACE_URL}/sitemap.xml`,
  };
}
