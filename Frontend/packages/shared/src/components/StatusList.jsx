"use client";

import { useId } from "react";
import Link from "next/link";
import { ringDashes } from "../lib/status";
import MediaImage from "./media/MediaImage.jsx";

/**
 * The story tray and the ring it is built out of.
 *
 * On screen this is "Stories"; in here it is still status — the context, the
 * route and `lib/status.js` all keep the old name, and renaming half of a pair
 * is worse than a name that has aged.
 *
 * This file used to carry a second shape as well: the WhatsApp-style rows that
 * made up the full-page list at /status. That page is gone — the rail shows
 * every story already — and the rows went with it, rather than sitting here as
 * exports nothing imports.
 */

const SIZE = 56;
const R = (SIZE - 4) / 2;
const C = 2 * Math.PI * R;

/**
 * Instagram's story ring: one arc per update so you can see how many are
 * waiting, drawn in a warm brand gradient until you have watched them and flat
 * grey afterwards. The gradient needs a real <defs> per instance, hence useId.
 */
export function StatusRing({
  avatar,
  alt,
  count = 0,
  seen = false,
  size = SIZE,
}) {
  // An absolutely-positioned <img> keeps its intrinsic size when only insets are
  // set, so the inner circle needs explicit width/height, not `inset`.
  const pad = count > 0 ? 6 : 0;
  const gradientId = `story-ring-${useId()}`;

  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      {count > 0 && (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0 -rotate-90"
          style={{ width: size, height: size }}
        >
          {!seen && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="45%" stopColor="#e11d48" />
                <stop offset="100%" stopColor="var(--brand-2)" />
              </linearGradient>
            </defs>
          )}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={ringDashes(count, C)}
            stroke={seen ? undefined : `url(#${gradientId})`}
            className={seen ? "stroke-line" : undefined}
          />
        </svg>
      )}
      {/* The clip lives on the wrapper and the blur on the image: an element's
          own overflow does not clip its own filter, so a blurred avatar would
          otherwise bleed straight through the ring. */}
      <span
        className="absolute overflow-hidden rounded-full"
        style={{
          top: pad,
          left: pad,
          width: size - pad * 2,
          height: size - pad * 2,
        }}
      >
        {avatar ? (
          <MediaImage
            discreet
            fill
            src={avatar}
            alt={alt}
            sizes={`${size}px`}
            className="object-cover"
          />
        ) : (
          <span
            className="brand-gradient grid h-full w-full place-items-center font-bold text-white"
            aria-label={alt}
          >
            {alt?.slice(0, 1).toUpperCase() || "?"}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * A published creator story, including the current account's own active story.
 * Story creation remains in the account menu; every bubble opens the player.
 */
function StoryBubble({ story, seen }) {
  const label = story.own ? "Your story" : story.name;
  const href = story.own ? "/status/me" : `/status/${story.id}`;
  const shell =
    "flex w-[64px] shrink-0 flex-col items-center gap-1.5 transition-transform active:scale-95";

  const body = (
    <>
      <span className="relative inline-block">
        <StatusRing
          avatar={story.avatar}
          alt={label}
          count={story.updates.length}
          seen={seen}
          size={58}
        />
      </span>
      <span
        className={`w-full truncate text-center text-[11px] ${
          seen ? "font-medium text-muted" : "font-semibold text-ink"
        }`}
      >
        {label}
      </span>
    </>
  );

  return (
    <Link href={href} className={shell}>
      {body}
    </Link>
  );
}

/**
 * Scrollable published stories in caller order: your active story first,
 * then unseen creators and already viewed creators. An empty list hides the rail.
 */
export function StoryRail({ stories, seen, className = "" }) {
  if (!stories.length) return null;

  return (
    <div
      className={`no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 pt-1 lg:mx-0 lg:px-0 ${className}`}
    >
      {stories.map((story) => (
        <StoryBubble
          key={story.id}
          story={story}
          seen={seen.includes(story.id)}
        />
      ))}
    </div>
  );
}
