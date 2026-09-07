import SellerProfile from "@vezlist/shared/pages/SellerProfile.jsx";
import { sellers } from "@vezlist/shared/data/mock.js";

export function generateStaticParams() {
  return Object.keys(sellers).map((id) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const seller = sellers[id];
  if (!seller) return { title: "Seller not found" };
  return {
    title: `${seller.name} — seller profile`,
    description: `${seller.location} · ${seller.rating}★ from ${seller.reviews} reviews.`,
  };
}

export default function Page() {
  return <SellerProfile />;
}
