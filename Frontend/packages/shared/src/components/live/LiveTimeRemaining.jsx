"use client";

import { Clock3, TriangleAlert } from "lucide-react";

export function liveTimeRemaining(session, now) {
  if (
    !session ||
    !["LIVE", "RECONNECTING"].includes(session.status) ||
    !Number.isFinite(now)
  )
    return null;
  const deadline = Date.parse(session.endsAt);
  if (!Number.isFinite(deadline)) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return {
    seconds,
    label: `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
    warning:
      seconds === 0
        ? "expired"
        : seconds <= 60
          ? "urgent"
          : seconds <= 300
            ? "soon"
            : null,
  };
}

export function LiveExpiryWarning({ session, now }) {
  const timing = liveTimeRemaining(session, now);
  if (!timing?.warning) return null;
  const urgent = timing.warning !== "soon";
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed shadow-lg ${urgent ? "border-rose-300/50 bg-rose-950/95 text-rose-50" : "border-amber-300/50 bg-amber-950/95 text-amber-50"}`}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p role="alert" key={timing.warning}>
        <strong className="block">
          {timing.warning === "expired"
            ? "Your live time has expired."
            : timing.warning === "urgent"
              ? "Your live time expires in 1 minute or less."
              : "Your live time expires in 5 minutes or less."}
        </strong>
        {timing.warning !== "expired" &&
          "This broadcast will end automatically when the countdown reaches zero."}
      </p>
    </div>
  );
}

export default function LiveTimeRemaining({ session, now }) {
  const timing = liveTimeRemaining(session, now);
  if (!timing)
    return (
      <span className="text-xs text-white/75">
        Live time starts when you’re live
      </span>
    );
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${timing.warning ? "text-amber-200" : "text-white/85"}`}
    >
      <Clock3 className="size-3.5" aria-hidden="true" />
      Time left{" "}
      <span role="timer" aria-live="off" className="font-bold tabular-nums">
        {timing.label}
      </span>
    </span>
  );
}
