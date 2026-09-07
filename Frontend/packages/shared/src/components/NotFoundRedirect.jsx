"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Avoids the Next.js dev timing bug caused by throwing redirect() while rendering a 404. */
export default function NotFoundRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 text-center">
      <div>
        <h1 className="text-xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-muted">Returning you to the home page…</p>
        <Link className="mt-4 inline-block font-semibold text-brand hover:underline" href="/">
          Go home now
        </Link>
      </div>
    </main>
  );
}
