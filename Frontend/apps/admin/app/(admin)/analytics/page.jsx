import { Suspense } from "react";
import Analytics from "@vezlist/shared/admin/Analytics.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Analytics",
  description: "Traffic, posting and engagement trends for both boards.",
};

// Reads the site scope and the range from the URL, so the prerendered shell
// needs a boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Analytics />
    </Suspense>
  );
}
