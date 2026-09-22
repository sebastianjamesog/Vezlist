import { Suspense } from "react";
import Appeals from "@vezlist/shared/admin/Appeals.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Appeals",
  description:
    "Reconsideration requests against rejected listings and suspended accounts.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Appeals />
    </Suspense>
  );
}
