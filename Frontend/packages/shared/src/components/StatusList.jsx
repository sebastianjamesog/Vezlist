"use client";

import { useId } from "react";
import Link from "next/link";
import { Camera, Plus } from "lucide-react";
import { ringDashes, statusTime } from "../lib/status";

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
        <img
          data-media
          src={avatar}
          alt={alt}
          loading="lazy"
          className="size-full object-cover"
        />
      </span>
    </span>
  );
}

/** One row of the Updates list. */
export function StatusRow({ story, seen, action }) {
  return (
    <Link
      href={`/status/${story.id}`}
      className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-canvas"
    >
      <StatusRing
        avatar={story.avatar}
        alt={story.name}
        count={story.updates.length}
        seen={seen}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-ink">
          {story.name}
        </span>
        <span className="mt-0.5 block text-[13px] text-muted">
          {statusTime(story.msAgo)}
          {story.updates.length > 1 && ` · ${story.updates.length} updates`}
        </span>
      </span>
      {action}
    </Link>
  );
}

/** The "My status" row: add when empty, view when not. */
export function MyStatusRow({ story, onAdd }) {
  const has = story.updates.length > 0;

  const body = (
    <>
      <span className="relative inline-block shrink-0">
        <StatusRing
          avatar={story.avatar}
          alt="Your status"
          count={story.updates.length}
        />
        {!has && (
          <span className="brand-gradient absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full ring-[3px] ring-surface">
            <Plus className="size-3.5 text-white" strokeWidth={3.5} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[16px] font-semibold text-ink">
          My status
        </span>
        <span className="mt-0.5 block text-[13px] text-muted">
          {has ? statusTime(story.msAgo) : "Tap to add status update"}
        </span>
      </span>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <Camera className="size-[18px]" strokeWidth={2.2} />
      </span>
    </>
  );

  const className =
    "flex w-full items-center gap-3.5 px-4 py-3 transition-colors hover:bg-canvas";

  return has ? (
    <Link href={`/status/${story.id}`} className={className}>
      {body}
    </Link>
  ) : (
    <button onClick={onAdd} className={className}>
      {body}
    </button>
  );
}

/**
 * One bubble in the story tray: ring above, name clipped to the bubble width.
 * Yours carries the add badge and opens the composer while it is empty.
 */
function StoryBubble({ story, seen, own = false, onAdd }) {
  const has = story.updates.length > 0;
  const label = own ? "Your story" : story.name;
  const shell =
    "flex w-[72px] shrink-0 flex-col items-center gap-1.5 transition-transform active:scale-95";

  const body = (
    <>
      <span className="relative inline-block">
        <StatusRing
          avatar={story.avatar}
          alt={label}
          count={story.updates.length}
          seen={seen}
          size={66}
        />
        {own && !has && (
          <span className="brand-gradient absolute bottom-0 right-0 grid size-[22px] place-items-center rounded-full ring-[3px] ring-surface">
            <Plus className="size-3.5 text-white" strokeWidth={3.5} />
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

  return own && !has ? (
    <button type="button" onClick={onAdd} className={shell}>
      {body}
    </button>
  ) : (
    <Link href={`/status/${story.id}`} className={shell}>
      {body}
    </Link>
  );
}

/**
 * The Instagram tray: yours first, then unwatched newest-first, then the ones
 * you have already seen. It scrolls sideways and bleeds to both screen edges,
 * so the last bubble reads as "there is more" rather than as the end.
 */
export function StoryRail({ mine, stories, seen, onAdd, className = "" }) {
  if (!mine && !stories.length) return null;

  return (
    <div
      className={`no-scrollbar -mx-4 flex gap-3.5 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0 ${className}`}
    >
      {mine && <StoryBubble story={mine} own onAdd={onAdd} />}
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

/** A labelled block of rows — "Recent updates" / "Viewed updates". */
export function StatusSection({ title, stories, seen, action, children }) {
  if (!stories.length) return null;
  return (
    <section>
      <h2 className="px-4 pb-1 pt-4 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
        {title}
      </h2>
      <div className="divide-y divide-line">
        {stories.map((story) => (
          <StatusRow key={story.id} story={story} seen={seen} action={action} />
        ))}
      </div>
      {children}
    </section>
  );
}
