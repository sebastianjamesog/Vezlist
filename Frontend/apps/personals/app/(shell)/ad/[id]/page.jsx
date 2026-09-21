import AdDetail from "@vezlist/shared/pages/AdDetail.jsx";
import { ads } from "@vezlist/shared/data/mock.js";
import { PERSONALS_URL, FEED_PATH } from "@vezlist/shared/lib/sites.js";

// Every ad is a known id, so all of them prerender at build time. The screen
// itself still reads useParams; what the server adds is the <title> and the
// static HTML, which is the half a crawler sees.
export function generateStaticParams() {
  return Object.keys(ads).map((id) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const ad = ads[id];
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

// Product + Offer + BreadcrumbList, built off the same ad body
// generateMetadata reads above. Emitted from this server route rather than
// the "use client" AdDetail screen, so a crawler that never runs JS still
// gets it in the initial HTML.
//
// The board has no category paths of its own — every post here is
// "Personals" as far as the taxonomy goes (see mock.js) — so the middle
// breadcrumb crumb points at the board's own feed (FEED_PATH, "/") rather
// than a route that does not exist on this site.
function adJsonLd(ad, id) {
  const url = `${PERSONALS_URL}/ad/${id}`;
  const crumbs = [
    { "@type": "ListItem", position: 1, name: "Home", item: PERSONALS_URL },
  ];
  if (ad.category) {
    crumbs.push({
      "@type": "ListItem",
      position: 2,
      name: ad.category,
      item: `${PERSONALS_URL}${FEED_PATH}`,
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
  const ad = ads[id];
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
