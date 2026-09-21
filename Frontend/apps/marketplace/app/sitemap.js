import { ads, categories, sellers } from "@vezlist/shared/data/mock.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";

// Every URL a crawler should actually see: the static shell (home, browse,
// nearby, faqs), one entry per category filter, and one per ad/seller — read
// from the same `ads` / `sellers` objects generateStaticParams already walks
// in app/(shell)/ad/[id]/page.jsx and app/(shell)/seller/[id]/page.jsx, so
// this list can never drift ahead of what's actually prerendered.
export default function sitemap() {
  const staticRoutes = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/browse", changeFrequency: "daily", priority: 0.8 },
    { path: "/nearby", changeFrequency: "daily", priority: 0.7 },
    { path: "/support/faqs", changeFrequency: "monthly", priority: 0.4 },
  ].map(({ path, ...rest }) => ({
    url: `${MARKETPLACE_URL}${path}`,
    ...rest,
  }));

  // Category browsing lives behind ?cat= on /browse, not a route segment
  // (see app/(shell)/browse/BrowseScreen.jsx), so each category's indexable
  // URL is a query string, not a path.
  const categoryRoutes = categories.map((category) => ({
    url: `${MARKETPLACE_URL}/browse?cat=${category.id}`,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const adRoutes = Object.keys(ads).map((id) => ({
    url: `${MARKETPLACE_URL}/ad/${id}`,
    changeFrequency: "daily",
    priority: 0.9,
  }));

  const sellerRoutes = Object.keys(sellers).map((id) => ({
    url: `${MARKETPLACE_URL}/seller/${id}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...categoryRoutes, ...adRoutes, ...sellerRoutes];
}
