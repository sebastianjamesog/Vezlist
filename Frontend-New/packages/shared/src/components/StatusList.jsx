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
        <MediaImage
          discreet
          fill
          src={avatar}
          alt={alt}
          sizes={`${size}px`}
          className="object-cover"
        />
      </span>
    </span>
  );
}

/**
 * One bubble in the story tray: ring above, name clipped to the bubble width.
 *
 * Every bubble is somebody else's now. The tray used to open with a "Your
 * story" tile carrying a + badge, and adding your own story has moved to the
 * account section — so the bubble is only ever a link into the player, and the
 * `own`/`onAdd` branch that made it sometimes a button is gone rather than
 * left here unreachable.
 */
function StoryBubble({ story, seen }) {
  const label = story.name;
  // A bubble marked live opens the broadcast. Tapping the LIVE flag and
  // landing on yesterday's photos is the whole reason the flag can't just be
  // decoration.
  const href =
    story.live && story.liveId
      ? `/live/${story.liveId}`
      : `/status/${story.id}`;
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
        {/* The live flag rides over the bottom of the ring, where Instagram
            puts it: the ring already means "unwatched", so this has to read as
            a different claim, not a louder one. */}
        {story.live && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-red-500 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-[0.06em] text-white ring-2 ring-canvas">
            Live
          </span>
        )}
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
 * The Instagram tray: unwatched newest-first, then the ones you have already
 * seen. It scrolls sideways and bleeds to both screen edges, so the last
 * bubble reads as "there is more" rather than as the end.
 *
 * The caller hands it one ordered list and nothing else. It used to take a
 * `mine` bubble and an `onAdd` for it; both are gone with the composer tile,
 * which means an empty list is now simply no rail at all.
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
