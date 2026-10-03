import SellerProfile from "@vezlist/shared/pages/SellerProfile.jsx";
import { publicSeller, safeJsonLd } from "@vezlist/shared/lib/serverPublic.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const seller = (await publicSeller(id, "MARKETPLACE"))?.seller;
  if (!seller) return { title: "Seller unavailable", robots: { index: false } };
  const title = `${seller.displayName} — seller profile`;
  return {
    title,
    description: `${seller.displayName} on Vezlist. Member since ${new Date(seller.memberSince).getFullYear()}.`,
    alternates: { canonical: `/seller/${id}` },
    openGraph: { title, url: `/seller/${id}`, type: "profile", images: seller.avatarUrl ? [seller.avatarUrl] : [] },
  };
}

export default async function Page({ params }) {
  const { id } = await params;
  const seller = (await publicSeller(id, "MARKETPLACE"))?.seller;
  const data = seller ? {
    "@context": "https://schema.org", "@type": "Person", name: seller.displayName,
    image: seller.avatarUrl || undefined, url: `${MARKETPLACE_URL}/seller/${id}`,
  } : null;
  return <>{data && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />}<SellerProfile /></>;
}
