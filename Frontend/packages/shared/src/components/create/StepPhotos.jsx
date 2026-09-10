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

const TIPS = [
  "Daylight beats flash",
  "Show every angle",
  "Be honest about flaws",
];

export default function StepPhotos({
  images,
  error,
  onAdd,
  onRemove,
  onMove,
  onMakeCover,
}) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const full = images.length >= MAX_IMAGES;
  const pick = () => input.current?.click();

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
      onAdd(
        [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")),
      );
    },
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
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
            {...dropProps}
            className={`group relative flex min-h-[240px] w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-200 ${
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
              Tap to pick up to {MAX_IMAGES}, or drag files in.
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
                <img
                  src={img.url}
                  alt={img.name}
                  className="size-full object-cover"
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
                <span className="absolute bottom-1.5 right-1.5 flex gap-1">
                  {i > 0 && (
                    <button
                      onClick={() => onMove(img.id, -1)}
                      aria-label={`Move ${img.name} left`}
                      className="grid size-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-brand"
                    >
                      <ChevronLeft className="size-3.5" strokeWidth={3} />
                    </button>
                  )}
                  {i < images.length - 1 && (
                    <button
                      onClick={() => onMove(img.id, 1)}
                      aria-label={`Move ${img.name} right`}
                      className="grid size-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-brand"
                    >
                      <ChevronRight className="size-3.5" strokeWidth={3} />
                    </button>
                  )}
                </span>
                {i > 0 && (
                  <button
                    onClick={() => onMakeCover(img.id)}
                    className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm hover:bg-brand"
                  >
                    Make cover
                  </button>
                )}
              </div>
            ))}

            {!full && (
              <button
                onClick={pick}
                aria-label="Add more photos"
                className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line bg-canvas/50 text-muted transition-colors hover:border-brand hover:bg-brand-soft/50 hover:text-brand"
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
          <p className="mt-1.5 text-[13px] text-muted">
            First photo is the cover.
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
