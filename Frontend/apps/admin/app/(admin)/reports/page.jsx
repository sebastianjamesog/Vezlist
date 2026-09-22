import { Suspense } from "react";
import Reports from "@vezlist/shared/admin/Reports.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Reports",
  description: "User-flagged listings and profiles awaiting review.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Reports />
    </Suspense>
  );
}
