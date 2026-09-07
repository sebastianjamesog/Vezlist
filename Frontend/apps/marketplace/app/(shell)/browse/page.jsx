import { Suspense } from "react";
import BrowseScreen from "./BrowseScreen.jsx";

export const metadata = { title: "Browse ads" };

// The feed reads ?cat= on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense>
      <BrowseScreen />
    </Suspense>
  );
}
