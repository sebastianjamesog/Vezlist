import CreatorProfile from "./CreatorProfile.jsx";

/**
 * Creator ids are real account UUIDs from GET /api/v1/sellers/trending and
 * the ad page's `ownerId`, so there is no static list to pre-render and no
 * mock row to title the page from — the profile loads client-side. There is
 * deliberately no JSON-LD rating here either: there are no reviews behind one
 * (#29), and a Person rich result off a client-rendered name is not worth a
 * server round-trip per crawl.
 */
export const metadata = {
  title: "Creator profile",
  description: "A creator's live posts, views and likes on Vezlist Personals.",
};

export default function Page() {
  return <CreatorProfile />;
}
