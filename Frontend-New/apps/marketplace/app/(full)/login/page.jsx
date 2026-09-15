import { Suspense } from "react";
import Login from "@vezlist/shared/pages/Login.jsx";
import {
  Skeleton,
  SkeletonGroup,
} from "@vezlist/shared/components/ui/Skeleton.jsx";

// No shell on this route (no nav, no header) to borrow a loading.jsx from —
// this fallback is the login card's own shape: wordmark, two fields, button.
function LoginFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <SkeletonGroup label="Loading" className="w-full max-w-sm space-y-3">
        <Skeleton className="mx-auto h-7 w-32 rounded" />
        <Skeleton className="mt-4 h-11 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-full" />
      </SkeletonGroup>
    </div>
  );
}

export const metadata = {
  title: "Sign in",
  description:
    "Sign in to Vezlist to post ads, save the ones you like and manage your account.",
};

// The form reads ?next= on the client, so the prerendered shell needs a
// boundary to stream it into.
export default function Page() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <Login />
    </Suspense>
  );
}
