import StatusViewer from "@vezlist/shared/pages/StatusViewer.jsx";
import { stories } from "@vezlist/shared/data/mock.js";

export function generateStaticParams() {
  return stories.map(({ id }) => ({ id }));
}

// Every stream and story used to inherit the generic site title —
// generateStaticParams walked these ids but nothing ever read them back for
// metadata, so a shared link to any story rendered the same card as the
// homepage.
export async function generateMetadata({ params }) {
  const { id } = await params;
  const story = stories.find((s) => s.id === id);
  if (!story) return { title: "Story not found" };
  const firstCaption = story.updates?.find((u) => u.caption)?.caption;
  const title = story.own ? "My status" : `${story.name}'s status`;
  const description = story.own
    ? "Your own status updates on Vezlist Personals."
    : firstCaption
      ? `${story.name}: “${firstCaption}”`
      : `See ${story.name}'s latest update on Vezlist Personals.`;
  const image = story.updates?.[0]?.image ?? story.avatar;
  const path = `/status/${id}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      images: image ? [{ url: image, alt: title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
    },
  };
}

export default function Page() {
  return <StatusViewer />;
}
