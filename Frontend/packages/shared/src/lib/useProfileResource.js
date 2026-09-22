"use client";

import { useEffect, useState } from "react";

/** Private account reads never reuse another user's last successful response. */
export function useProfileResource(userId, load) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState({ userId: null, status: "idle" });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setSnapshot({ userId, status: "loading" });
    Promise.resolve()
      .then(load)
      .then(
        (data) => {
          if (!cancelled) setSnapshot({ userId, status: "success", data });
        },
        () => {
          if (!cancelled) setSnapshot({ userId, status: "error" });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, load, attempt]);

  const current =
    userId && snapshot.userId === userId
      ? snapshot
      : { status: userId ? "loading" : "idle" };
  return { ...current, retry: () => setAttempt((value) => value + 1) };
}
