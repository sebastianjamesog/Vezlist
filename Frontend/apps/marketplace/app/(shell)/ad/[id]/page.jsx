import AdDetail from "@vezlist/shared/pages/AdDetail.jsx";
import { publicListing, safeJsonLd } from "@vezlist/shared/lib/serverPublic.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const listing = await publicListing(id, "MARKETPLACE");
  if (!listing) return { title: "Ad unavailable", robots: { index: false } };
  const description = `${listing.title} in ${listing.locationLabel}. ${listing.description}`.slice(0, 160);
  const image = listing.media?.find((media) => media.cover && media.url)?.url;
  const path = `/ad/${id}`;
  return {
    title: listing.title,
    description,
    alternates: { canonical: path },
    openGraph: { title: listing.title, description, url: path, images: image ? [image] : [] },
  };
}

export default async function Page({ params }) {
  const { id } = await params;
  const listing = await publicListing(id, "MARKETPLACE");
  const data = listing ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description,
    image: listing.media?.filter((media) => media.url).map((media) => media.url) ?? [],
    url: `${MARKETPLACE_URL}/ad/${id}`,
    offers: listing.price == null ? undefined : {
      "@type": "Offer", price: String(listing.price), priceCurrency: "CAD",
      availability: "https://schema.org/InStock",
    },
  } : null;
  return <>{data && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />}<AdDetail /></>;
}
