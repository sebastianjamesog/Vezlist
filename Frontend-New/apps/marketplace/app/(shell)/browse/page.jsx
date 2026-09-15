import { Suspense } from "react";
import BrowseScreen from "./BrowseScreen.jsx";
import Loading from "./loading.jsx";
import { categories, listings } from "@vezlist/shared/data/mock.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";

/**
 * The canonical story for this route, decided once here rather than argued
 * over per-URL: sitemap.js already lists one indexable URL per category —
 * `/browse?cat=<id>` — on top of the bare `/browse` shell, because a category
 * feed is a real landing page worth ranking on its own. This function is what
 * keeps that promise true. A `cat` that resolves to a real category
 * canonicalises to its own clean `?cat=` URL (the same one the sitemap
 * lists), so those 19 URLs stay indexable rather than being told by their own
 * canonical tag to defer to `/browse`. Anything else a filter can add on top —
 * `?sort=`, `?sub=`, `?page=`, a `cat` that does not match a real category —
 * canonicalises down to that clean URL (or to bare `/browse` with no `cat` at
 * all) instead of minting a new indexable permutation per combination.
 */
function canonicalFor(catId) {
  const category = catId ? categories.find((c) => c.id === catId) : null;
  return {
    category,
    path: category ? `/browse?cat=${category.id}` : "/browse",
  };
}

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const catId = typeof sp.cat === "string" ? sp.cat : undefined;
  const { category, path } = canonicalFor(catId);
  const title = category ? `${category.label} ads` : "Browse ads";
  const description = category
    ? `Browse ${category.label.toLowerCase()} ads for sale near you on Vezlist, updated daily.`
    : "Browse every ad on Vezlist — vehicles, jobs, services, electronics and more — filtered by category and location.";
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

// ItemList for whatever the category filter (if any) narrows the feed to.
// BrowseScreen re-filters on the client (query, sort, sub-category, ...), so
// this is the server-rendered approximation a crawler that never runs JS
// still gets — the same category cut the shell would open on, before any
// further client-side narrowing.
function browseJsonLd(category) {
  const items = (
    category ? listings.filter((l) => l.categoryId === category.id) : listings
  ).slice(0, 20);
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((l, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: l.title,
      url: `${MARKETPLACE_URL}/ad/${l.adId}`,
      image: l.image,
    })),
  };
}

// The feed reads ?cat= on the client, so the prerendered shell needs a
// boundary to stream it into.
export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const catId = typeof sp.cat === "string" ? sp.cat : undefined;
  const { category } = canonicalFor(catId);
  const jsonLd = browseJsonLd(category);
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Suspense fallback={<Loading />}>
        <BrowseScreen />
      </Suspense>
    </>
  );
}
