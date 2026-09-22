import { Suspense } from "react";
import Audit from "@vezlist/shared/admin/Audit.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Audit log",
  description:
    "A record of every moderation and configuration action taken in the console.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Audit />
    </Suspense>
  );
}
