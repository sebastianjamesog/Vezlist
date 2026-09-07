import { Suspense } from "react";
import Login from "@vezlist/shared/pages/Login.jsx";

export const metadata = { title: "Sign in" };

// The form reads ?next= on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
