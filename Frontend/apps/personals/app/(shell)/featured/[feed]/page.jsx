import { notFound } from "next/navigation";
import FeaturedScreen from "./FeaturedScreen.jsx";

const FEEDS = {
  available: { title: "Available Now", feed: "AVAILABLE_NOW" },
  new: { title: "New Today", feed: "NEW_TODAY" },
  trending: { title: "Trending", feed: "TRENDING" },
};

export async function generateMetadata({ params }) {
  const { feed } = await params;
  return { title: FEEDS[feed]?.title || "Featured ads", robots: { index: false } };
}

export default async function Page({ params }) {
  const { feed } = await params;
  const config = FEEDS[feed];
  if (!config) notFound();
  return <FeaturedScreen title={config.title} feed={config.feed} />;
}
