import { Suspense } from "react";
import Users from "@vezlist/shared/admin/Users.jsx";
import Loading from "../loading.jsx";

export const metadata = {
  title: "Users",
  description: "Search, review and manage user accounts across both boards.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Users />
    </Suspense>
  );
}
