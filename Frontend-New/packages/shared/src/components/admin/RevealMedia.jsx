"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Personals media, withheld until it is asked for.
 *
 * The console is opened on office screens and in shared rooms, and the two
 * screens that moderate personals media are wall-to-wall photographs. So they
 * open closed, and stay that way until this screen's Reveal button is
 * pressed.
 *
 * `revealed` is meant to be handed straight to `MediaImage`'s `revealed`
 * prop on every image in the grid this guards. Before this component's photos
 * were fetched either way and merely blurred with CSS over a shared
 * `[data-discreet]` attribute — a comment on this file used to admit as much
 * ("the images are in the DOM and one click away"). That is no longer true:
 * `MediaImage` does not set `src` while `revealed` is `false`, so nothing
 * downloads until a moderator asks for it. What has *not* changed is the
 * granularity — one button reveals the whole screen, the same as before,
 * because that is the control this console has ever offered and building a
 * per-photo reveal is a separate piece of work, not implied by making the
 * existing button do what it always looked like it did.
 */
export function useReveal() {
  const [revealed, setRevealed] = useState(false);
  return {
    revealed,
    toggle: () => setRevealed((r) => !r),
  };
}

export function RevealButton({ revealed, onClick, className = "" }) {
  const Glyph = revealed ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={revealed}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink/25 ${className}`}
    >
      <Glyph className="size-4" strokeWidth={2.4} aria-hidden="true" />
      {revealed ? "Hide media" : "Reveal media"}
    </button>
  );
}
