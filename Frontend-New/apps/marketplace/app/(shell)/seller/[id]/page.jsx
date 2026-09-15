import SellerProfile from "@vezlist/shared/pages/SellerProfile.jsx";
import { listings, sellers } from "@vezlist/shared/data/mock.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";
import {
  sellerForListings,
  sellerIdsForListings,
} from "@vezlist/shared/lib/siteContent.js";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return sellerIdsForListings(sellers, listings).map((id) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const seller = sellerForListings(sellers, id, listings);
  if (!seller) return { title: "Seller not found" };
  const title = `${seller.name} — seller profile`;
  // No star rating, for the same reason the JSON-LD below carries no
  // `aggregateRating`: there are no reviews behind it (#29 closed
  // not-planned), and a seeded number is no more honest in a meta description
  // than it was on the profile it has now been removed from.
  const description = `${seller.name} on Vezlist · ${seller.location} · Member since ${seller.since}.`;
  const path = `/seller/${id}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "profile",
      images: seller.avatar
        ? [{ url: seller.avatar, width: 300, height: 300, alt: seller.name }]
        : [],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: seller.avatar ? [seller.avatar] : [],
    },
  };
}

function sellerJsonLd(seller, id) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: seller.name,
    image: seller.avatar,
    url: `${MARKETPLACE_URL}/seller/${id}`,
    address: seller.location
      ? { "@type": "PostalAddress", addressLocality: seller.location }
      : undefined,
    /**
     * No `aggregateRating` here, deliberately. `seller.rating` and
     * `seller.reviews` are seeded numbers with no reviews behind them (#29),
     * and search engines require review markup to describe real user reviews.
     * Marking up a rating nobody left is how a site earns a manual action
     * rather than a rich snippet. Add it back with #29, off real reviews.
     */
  };
}

export default async function Page({ params }) {
  const { id } = await params;
  const seller = sellerForListings(sellers, id, listings);
  if (!seller) notFound();
  return (
    <>
      {seller && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(sellerJsonLd(seller, id)),
          }}
        />
      )}
      <SellerProfile />
    </>
  );
}
