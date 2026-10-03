import { publicCategories, publicDiscovery } from "@vezlist/shared/lib/serverPublic.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";

export default async function sitemap() {
  const staticRoutes = ["/", "/browse", "/nearby", "/support/faqs"].map((path) => ({
    url: `${MARKETPLACE_URL}${path}`,
  }));
  const categories = await publicCategories("MARKETPLACE") ?? [];
  const categoryRoutes = categories.map((category) => ({
    url: `${MARKETPLACE_URL}/browse?cat=${encodeURIComponent(category.id)}`,
  }));

  const listings = [];
  let cursor = null;
  // The sitemap protocol allows up to 50,000 URLs per file.
  while (listings.length < 49_000) {
    const page = await publicDiscovery("MARKETPLACE", cursor);
    if (!page?.items?.length) break;
    listings.push(...page.items.map((listing) => ({
      url: `${MARKETPLACE_URL}/ad/${listing.id}`,
      lastModified: listing.publishedAt,
    })));
    if (!page.nextCursor || page.nextCursor === cursor) break;
    cursor = page.nextCursor;
  }
  return [...staticRoutes, ...categoryRoutes, ...listings];
}
