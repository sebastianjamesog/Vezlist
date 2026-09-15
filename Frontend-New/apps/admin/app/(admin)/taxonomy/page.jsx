import { Suspense } from "react";
import Taxonomy from "@vezlist/shared/admin/Taxonomy.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Taxonomy",
  description: "Manage categories and sub-categories for both boards.",
};

// The section tabs live in ?tab=, so the prerendered shell needs a boundary to
// stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Taxonomy />
    </Suspense>
  );
}
