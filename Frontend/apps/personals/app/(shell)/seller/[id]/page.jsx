import SellerProfile from "@vezlist/shared/pages/SellerProfile.jsx";
import { publicSeller } from "@vezlist/shared/lib/serverPublic.js";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const seller = (await publicSeller(id, "PERSONALS"))?.seller;
  if (!seller) return { title: "Seller unavailable", robots: { index: false } };
  return { title: `${seller.displayName} — seller profile`, robots: { index: false } };
}

export default function Page() {
  return <SellerProfile />;
}
