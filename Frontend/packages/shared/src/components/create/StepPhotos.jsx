"use client";

import { useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Plus,
  Star,
  X,
} from "lucide-react";
import { MAX_IMAGES } from "../../lib/adDraft";
import { WATERMARK_TEXT } from "../../lib/media";
import MediaImage from "../media/MediaImage.jsx";

const TIPS = [
  "Daylight beats flash",
  "Show every angle",
  "Be honest about flaws",
];

/**
 * Buttons, not drag-and-drop, for reordering.
 *
 * Native HTML5 drag-and-drop is pointer-only — it fires no events a keyboard
 * can trigger, so shipping it still means building a button-based fallback
 * for anyone who tabs instead of drags, at which point the drag layer is
 * extra code maintaining a second path to the same result. Buttons alone
 * are keyboard-operable for free (focus, Enter/Space, the same way `Remove`
 * already works two lines below) and are the entire feature rather than the
 * accessible half of it.
 */
export default function StepPhotos({
  images,
  error,
  busy = false,
  onAdd,
  onRemove,
  onReorder,
}) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const full = images.length >= MAX_IMAGES;
  const many = images.length > 1;
  const pick = () => !busy && input.current?.click();

  // Native drag-and-drop: desktop users expect to throw files at the box.
  const dropProps = {
    onDragOver: (e) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => {
      e.preventDefault();
      setDragging(false);
      // Every file goes to `onAdd` regardless of what it claims to be —
      // `validatePhotoFile` is the one place that decides, so a non-image
      // dropped here gets the same clear message a non-image picked past
      // `accept="image/*"` in the OS dialog gets, rather than vanishing
      // silently at this filter instead.
      if (!busy) onAdd([...e.dataTransfer.files]);
    },
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          onAdd([...e.target.files]);
          e.target.value = "";
        }}
      />

      {images.length === 0 ? (
        <>
          <button
            onClick={pick}
            disabled={busy}
            {...dropProps}
            className={`group relative flex min-h-[240px] w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-200 disabled:cursor-wait disabled:opacity-70 ${
              dragging
                ? "scale-[1.01] border-brand bg-brand-soft"
                : "border-line bg-gradient-to-b from-brand-soft/60 via-surface to-canvas hover:border-brand"
            }`}
          >
            {/* Soft brand glow so the empty state isn't a white void. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 size-48 rounded-full bg-brand/10 blur-3xl"
            />

            {/* Tilted photo stack — leans open on hover. */}
            <span
              aria-hidden="true"
              className="relative mb-5 grid size-28 place-items-center"
            >
              <span className="absolute size-[68px] -translate-x-8 translate-y-1 -rotate-[14deg] rounded-card bg-surface shadow-lift ring-1 ring-line transition-transform duration-300 group-hover:-translate-x-12 group-hover:-rotate-[24deg]" />
              <span className="absolute size-[68px] translate-x-8 translate-y-1 rotate-[14deg] rounded-2xl bg-brand-soft shadow-lift ring-1 ring-brand/25 transition-transform duration-300 group-hover:translate-x-12 group-hover:rotate-[24deg]" />
              <span className="brand-gradient relative grid size-[68px] place-items-center rounded-2xl text-on-brand shadow-pop transition-transform duration-300 group-hover:-translate-y-1">
                <Camera className="size-8" strokeWidth={1.8} />
              </span>
            </span>

            <span className="relative text-[18px] font-bold text-ink">
              {dragging ? "Drop them here" : "Add your photos"}
            </span>
            <span className="relative mt-1.5 max-w-[15rem] text-center text-[14px] leading-relaxed text-muted">
              Tap to pick up to {MAX_IMAGES}, or drag files in. Each one gets a
              small {WATERMARK_TEXT} mark.
            </span>

            <span className="brand-gradient relative mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-bold text-on-brand shadow-pop transition-transform group-hover:scale-105">
              <ImagePlus className="size-4" strokeWidth={2.4} />
              Choose photos
            </span>
          </button>

          <ul className="mt-4 flex shrink-0 flex-wrap gap-1.5">
            {TIPS.map((tip) => (
              <li
                key={tip}
                className="rounded-full bg-canvas px-2.5 py-1 text-[12px] font-medium text-muted"
              >
                {tip}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div
          {...dropProps}
          className={dragging ? "rounded-2xl ring-2 ring-brand" : ""}
        >
          <div className="grid grid-cols-3 gap-2.5">
            {images.map((img, i) => (
              <div
                key={img.id}
                className="relative aspect-square overflow-hidden rounded-2xl bg-canvas ring-1 ring-line"
              >
                <MediaImage
                  fill
                  src={img.url}
                  alt={img.name}
                  sizes="33vw"
                  className="object-cover"
                />
                {i === 0 && (
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-wide text-white">
                    <Star className="size-2.5 fill-white" />
                    Cover
                  </span>
                )}
                <button
                  onClick={() => onRemove(img.id)}
                  aria-label={`Remove ${img.name}`}
                  className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-red-500"
                >
                  <X className="size-3.5" strokeWidth={3} />
                </button>

                {/*
                  Reordering: every button here is a normal, focusable
                  `<button>`, so Tab reaches it and Enter/Space activates it —
                  no separate keyboard path to build or maintain. `i === 0`
                  gets none of these; the way it stops being the cover is
                  another photo's "Make cover" bumping it to position 1, the
                  same as removing and re-adding used to, minus the remove.
                */}
                {many && i !== 0 && (
                  <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
                    <button
                      onClick={() => onReorder(img.id, i - 1)}
                      aria-label={`Move ${img.name} earlier`}
                      className="grid size-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 disabled:pointer-events-none disabled:opacity-0"
                    >
                      <ChevronLeft className="size-3.5" strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => onReorder(img.id, 0)}
                      aria-label={`Make ${img.name} the cover photo`}
                      className="grid size-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-brand"
                    >
                      <Star className="size-3.5" strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => onReorder(img.id, i + 1)}
                      disabled={i === images.length - 1}
                      aria-label={`Move ${img.name} later`}
                      className="grid size-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 disabled:pointer-events-none disabled:opacity-0"
                    >
                      <ChevronRight className="size-3.5" strokeWidth={3} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {!full && (
              <button
                onClick={pick}
                disabled={busy}
                aria-label="Add more photos"
                className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line bg-canvas/50 text-muted transition-colors hover:border-brand hover:bg-brand-soft/50 hover:text-brand disabled:cursor-wait disabled:opacity-60"
              >
                <Plus className="size-7" strokeWidth={2.2} />
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brand transition-all duration-300"
                style={{ width: `${(images.length / MAX_IMAGES) * 100}%` }}
              />
            </div>
            <p className="shrink-0 text-[12px] font-medium tabular-nums text-muted">
              {images.length}/{MAX_IMAGES}
            </p>
          </div>
          <p className="mt-1.5 text-[13px] text-muted" aria-live="polite">
            {busy
              ? "Processing photo…"
              : many
                ? "First photo is the cover — use the star to change it."
                : "First photo is the cover."}
          </p>
          {/*
            Said plainly, before publishing rather than after: the mark is
            burnt into the file the moment the photo is picked (see
            `lib/media.js`), so what the poster ends up storing and sharing
            already carries it. Stated here so nobody is surprised by a mark
            on a photo they later download back out of their own ad, and
            deliberately not offered as a toggle — the mark being
            unconditional is the only reason it means anything.
          */}
          <p className="mt-1 text-[12px] text-muted">
            Every photo carries a small {WATERMARK_TEXT} mark in the corner.
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 shrink-0 text-[13px] font-medium text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
