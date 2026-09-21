import { Suspense } from "react";
import Listings from "@vezlist/shared/admin/Listings.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Listings",
  description: "Review, moderate and search live listings across both boards.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Listings />
    </Suspense>
  );
}
