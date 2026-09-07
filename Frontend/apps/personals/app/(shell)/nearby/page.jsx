import { Suspense } from "react";
import Nearby from "@vezlist/shared/pages/Nearby.jsx";

export const metadata = { title: "Nearby" };

// The screen reads ?view= on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense>
      <Nearby />
    </Suspense>
  );
}
