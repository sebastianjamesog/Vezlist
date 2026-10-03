import CreatorProfile from "./CreatorProfile.jsx";
import { publicSeller } from "@vezlist/shared/lib/serverPublic.js";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const seller = (await publicSeller(id, "PERSONALS"))?.seller;
  if (!seller)
    return { title: "Creator unavailable", robots: { index: false } };
  return {
    title: `${seller.displayName} - creator profile`,
    robots: { index: false },
  };
}

export default function Page() {
  return <CreatorProfile />;
}
