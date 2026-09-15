import AdDetail from "@vezlist/shared/pages/AdDetail.jsx";
import { ads, categories } from "@vezlist/shared/data/mock.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";
import {
  adForSite,
  adIdsForSite,
  MARKETPLACE_SITE,
} from "@vezlist/shared/lib/siteContent.js";
import { notFound } from "next/navigation";

// Every ad is a known id, so all of them prerender at build time. The screen
// itself still reads useParams; what the server adds is the <title> and the
// static HTML, which is the half a crawler sees.
export function generateStaticParams() {
  return adIdsForSite(ads, MARKETPLACE_SITE).map((id) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const ad = adForSite(ads, id, MARKETPLACE_SITE);
  if (!ad) return { title: "Ad not found" };
  const title = `${ad.title} — $${ad.price.toLocaleString("en-CA")}`;
  const description = `${ad.title} in ${ad.location}. ${ad.postedLabel}.`;
  const image = ad.photos?.[0];
  const path = `/ad/${id}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      images: image
        ? [{ url: image, width: 800, height: 800, alt: ad.title }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
    },
  };
}

// The category strip has no path of its own — it lives behind ?cat= on
// /browse (see BrowseScreen.jsx) — so the breadcrumb's middle crumb has to
// look the id up the same way the sitemap does, rather than assuming one.
function categoryHref(categoryLabel) {
  const category = categories.find((c) => c.label === categoryLabel);
  return category ? `/browse?cat=${category.id}` : "/browse";
}

// Product + Offer + BreadcrumbList, built off the same ad body
// generateMetadata reads above. Emitted from this server route rather than
// the "use client" AdDetail screen, so a crawler that never runs JS still
// gets it in the initial HTML.
function adJsonLd(ad, id) {
  const url = `${MARKETPLACE_URL}/ad/${id}`;
  const crumbs = [
    { "@type": "ListItem", position: 1, name: "Home", item: MARKETPLACE_URL },
  ];
  if (ad.category) {
    crumbs.push({
      "@type": "ListItem",
      position: 2,
      name: ad.category,
      item: `${MARKETPLACE_URL}${categoryHref(ad.category)}`,
    });
  }
  crumbs.push({
    "@type": "ListItem",
    position: crumbs.length + 1,
    name: ad.title,
    item: url,
  });

  return [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: ad.title,
      image: ad.photos ?? [],
      description: ad.description?.join(" ") ?? ad.title,
      url,
      offers: {
        "@type": "Offer",
        price: String(ad.price),
        priceCurrency: "CAD",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/UsedCondition",
        url,
        seller: {
          "@type": "Person",
          name: ad.seller?.name ?? "Vezlist seller",
        },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs,
    },
  ];
}

export default async function Page({ params }) {
  const { id } = await params;
  const ad = adForSite(ads, id, MARKETPLACE_SITE);
  if (!ad) notFound();
  return (
    <>
      {ad && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(adJsonLd(ad, id)),
          }}
        />
      )}
      <AdDetail />
    </>
  );
}
