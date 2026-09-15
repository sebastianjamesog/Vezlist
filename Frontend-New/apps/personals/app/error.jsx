"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { reportError } from "@vezlist/shared/lib/observability.js";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";

/**
 * Route-level error boundary. Catches anything that throws below the root
 * layout, so `<html data-theme="personals">`/`<body>` and the age gate are
 * still standing; `global-error.jsx` is the one that has to rebuild those.
 */
export default function Error({ error, retry }) {
  useEffect(() => {
    // The route comes off `location` inside `reportError`; `digest` is the
    // only thing Next hands a client boundary about a *server* error, and it
    // is what ties this report to the Worker log line that has the stack.
    reportError(error, { scope: "route-boundary" });
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16">
      <EmptyState
        icon="Wrench"
        title="Something went wrong"
        body="This page hit a snag. Try again, or head back to Live."
        action={<Button onClick={() => retry()}>Try again</Button>}
      />
    </div>
  );
}
