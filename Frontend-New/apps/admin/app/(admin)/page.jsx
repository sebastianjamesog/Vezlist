import { Suspense } from "react";
import Dashboard from "@vezlist/shared/admin/Dashboard.jsx";
import Loading from "./loading.jsx";

export const metadata = {
  title: "Dashboard",
  description: "At-a-glance metrics and activity across both Vezlist boards.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
