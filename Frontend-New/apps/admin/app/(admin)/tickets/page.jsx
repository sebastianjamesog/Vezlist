import { Suspense } from "react";
import Tickets from "@vezlist/shared/admin/Tickets.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Tickets",
  description: "Support tickets awaiting an admin reply, across both boards.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Tickets />
    </Suspense>
  );
}
