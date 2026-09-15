import { Suspense } from "react";
import Faqs from "@vezlist/shared/pages/Faqs.jsx";
import Loading from "../../loading.jsx";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Faqs />
    </Suspense>
  );
}
