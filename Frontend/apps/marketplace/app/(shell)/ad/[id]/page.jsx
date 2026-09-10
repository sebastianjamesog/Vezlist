import AdDetail from "@vezlist/shared/pages/AdDetail.jsx";
import { ads } from "@vezlist/shared/data/mock.js";

// Every ad is a known id, so all of them prerender at build time. The screen
// itself still reads useParams; what the server adds is the <title> and the
// static HTML, which is the half a crawler sees.
export function generateStaticParams() {
  return Object.keys(ads).map((id) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const ad = ads[id];
  if (!ad) {
    return {
      title: "Ad details",
      description: "View this Vezlist marketplace listing.",
    };
  }
  return {
    title: `${ad.title} — $${ad.price.toLocaleString("en-CA")}`,
    description: `${ad.title} in ${ad.location}. ${ad.postedLabel}.`,
    openGraph: { images: ad.photos?.[0] ? [ad.photos[0]] : [] },
  };
}

export default function Page() {
  return <AdDetail />;
}
