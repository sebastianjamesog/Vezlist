import { Suspense } from "react";
import Nearby from "@vezlist/shared/pages/Nearby.jsx";
import Loading from "./loading.jsx";

export const metadata = {
  title: "Nearby",
  description: "See personals posted close to you on a map.",
};

// Nearby no longer reads a search param, so the boundary is not required for
// that any more. It stays because the screen loads Leaflet through
// next/dynamic, and a boundary is what the prerendered shell streams into
// while that client-only chunk arrives.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Nearby />
    </Suspense>
  );
}
