import { Suspense } from "react";
import AdminLogin from "@vezlist/shared/admin/AdminLogin.jsx";
import {
  Skeleton,
  SkeletonGroup,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

// Outside the `(admin)` group — no console rail here to borrow a loading.jsx
// from — so this fallback is the sign-in card's own shape.
function AdminLoginFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <SkeletonGroup label="Loading" className="w-full max-w-sm space-y-3">
        <Skeleton className="mx-auto h-7 w-40 rounded" />
        <Skeleton className="mt-4 h-11 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-full" />
      </SkeletonGroup>
    </div>
  );
}

export const metadata = {
  title: "Sign in",
  description: "Sign in to the Vezlist console.",
};

// Reads the URL filters on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<AdminLoginFallback />}>
      <AdminLogin />
    </Suspense>
  );
}
