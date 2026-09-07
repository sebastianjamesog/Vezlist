import { Suspense } from "react";
import Faqs from "@vezlist/shared/pages/Faqs.jsx";

export default function Page() {
  return (
    <Suspense>
      <Faqs />
    </Suspense>
  );
}
