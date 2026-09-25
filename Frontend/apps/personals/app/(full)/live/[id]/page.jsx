import { allLiveStreams } from "@vezlist/shared/data/mock.js";
import LiveViewer from "./LiveViewer.jsx";

export function generateStaticParams() {
  return allLiveStreams.map(({ id }) => ({ id }));
}

// Every stream and story used to inherit the generic site title —
// generateStaticParams walked these ids but nothing ever read them back for
// metadata, so a shared link to any broadcast rendered the same card as the
// homepage.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const stream = allLiveStreams.find((s) => s.id === id);
  if (!stream) return { title: "Live stream not found" };
  const title = `${stream.title} — ${stream.host} is live`;
  const description = `${stream.host} is broadcasting live from ${stream.location}. ${stream.viewers.toLocaleString("en-US")} watching now.`;
  const path = `/live/${id}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "video.other",
      images: stream.cover
        ? [{ url: stream.cover, width: 800, height: 1067, alt: stream.title }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: stream.cover ? [stream.cover] : [],
    },
  };
}

export default function Page() {
  return <LiveViewer />;
}
