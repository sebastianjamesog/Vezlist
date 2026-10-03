import AdDetail from "@vezlist/shared/pages/AdDetail.jsx";
import { publicListing } from "@vezlist/shared/lib/serverPublic.js";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const listing = await publicListing(id, "PERSONALS");
  if (!listing) return { title: "Ad unavailable", robots: { index: false } };
  return {
    title: listing.title,
    description: `${listing.title} in ${listing.locationLabel}. ${listing.description}`.slice(0, 160),
    robots: { index: false },
  };
}

export default function Page() {
  return <AdDetail />;
}
