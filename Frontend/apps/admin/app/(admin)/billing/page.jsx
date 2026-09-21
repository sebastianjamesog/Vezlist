import { Suspense } from "react";
import Billing from "@vezlist/shared/admin/Billing.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Billing",
  description: "Boost and subscription revenue across both boards.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Billing />
    </Suspense>
  );
}
