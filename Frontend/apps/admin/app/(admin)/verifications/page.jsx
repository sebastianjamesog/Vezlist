import { Suspense } from "react";
import Verifications from "@vezlist/shared/admin/Verifications.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Verifications",
  description: "Seller-requested ad verification codes and photos awaiting review.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Verifications />
    </Suspense>
  );
}
