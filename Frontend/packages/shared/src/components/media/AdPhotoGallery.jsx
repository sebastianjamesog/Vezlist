"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import MediaImage from "./MediaImage.jsx";

const CONTROL =
  "grid size-11 shrink-0 place-items-center rounded-full border border-white/50 bg-black/55 text-white hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

function Thumbnails({ photos, active, onSelect, dark = false, verified = false, label = "Photo thumbnails" }) {
  const strip = useRef(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = strip.current;
    if (!element) return undefined;
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [photos.length]);
  useEffect(() => {
    const button = strip.current?.querySelector(`[data-photo-index="${active}"]`);
    if (!button) return;
    const left = button.offsetLeft;
    if (left < strip.current.scrollLeft) strip.current.scrollLeft = left;
    else if (left + button.offsetWidth > strip.current.scrollLeft + strip.current.clientWidth)
      strip.current.scrollLeft = left + button.offsetWidth - strip.current.clientWidth;
  }, [active]);

  return (
    <div className="relative flex min-w-0 items-center gap-1">
      <div ref={strip} aria-label={label} className="no-scrollbar relative flex min-w-0 flex-1 gap-2 overflow-x-auto p-1">
        {photos.map((photo) => (
          <button key={photo.index} data-photo-index={photo.index} type="button"
            onClick={() => onSelect(photo.index)} aria-label={`Show photo ${photo.index + 1}`}
            aria-current={photo.index === active ? "true" : undefined}
            className={`relative size-14 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:size-16 ${
              photo.index === active ? verified ? "border-emerald-600 ring-2 ring-emerald-500" : "border-brand ring-2 ring-brand"
                : verified ? "border-emerald-500" : dark ? "border-white/20" : "border-line"}`}>
            <MediaImage discreet fill src={photo.url} alt="" sizes="64px" className="object-cover object-top" />
          </button>
        ))}
      </div>
      {overflow && <button type="button" aria-label={`More ${label.toLowerCase()}`}
        onClick={() => {
          const element = strip.current;
          if (!element) return;
          const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
          element.scrollLeft = atEnd ? 0 : element.scrollLeft + element.clientWidth * 0.8;
        }}
        className={`grid size-8 shrink-0 place-items-center rounded-lg shadow-card focus-visible:outline-2 focus-visible:outline-brand ${dark ? "bg-black/80 text-white" : "bg-surface text-ink"}`}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>}
    </div>
  );
}

function PhotoGroups({ photos, active, onSelect, dark = false }) {
  const verified = photos.filter((photo) => photo.verified);
  const regular = photos.filter((photo) => !photo.verified);
  return (
    <div className={`grid min-w-0 gap-2 ${verified.length ? "grid-cols-2" : "grid-cols-1"}`}>
      {[
        ...(verified.length ? [{ title: "Verified pictures", photos: verified, verified: true }] : []),
        { title: "Non-verified pictures", photos: regular, verified: false },
      ].map((group) => (
        <section key={group.title} className={`min-w-0 ${group.verified ? "border-r border-line pr-2" : ""}`}>
          <h3 className={`mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide lg:text-[10px] ${group.verified ? "text-emerald-600" : dark ? "text-white/70" : "text-muted"}`}>
            {group.verified && <BadgeCheck className="size-3 shrink-0" aria-hidden="true" />}{group.title}
          </h3>
          {group.photos.length ? <Thumbnails {...group} label={group.title} active={active} onSelect={onSelect} dark={dark} />
            : <p className={`px-1 py-4 text-xs ${dark ? "text-white/60" : "text-muted"}`}>None</p>}
        </section>
      ))}
    </div>
  );
}

export default function AdPhotoGallery({ photos: inputPhotos, title, onSwipeAd }) {
  const photos = inputPhotos.map((photo, index) => ({
    ...(typeof photo === "string" ? { url: photo, verified: false } : photo), index,
  }));
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const gesture = useRef(null);
  const swiped = useRef(false);
  const multiple = photos.length > 1;

  useEffect(() => {
    if (!open) return undefined;
    const element = dialog.current;
    const returnFocus = trigger.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      swiped.current = false;
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  function move(delta) {
    setActive((current) => (current + delta + photos.length) % photos.length);
  }

  const swipeHandlers = {
    onTouchStart(event) {
      swiped.current = false;
      gesture.current =
        event.touches.length === 1
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
    },
    onTouchMove(event) {
      if (event.touches.length !== 1) gesture.current = null;
    },
    onTouchCancel() {
      gesture.current = null;
    },
    onTouchEnd(event) {
      const start = gesture.current;
      gesture.current = null;
      if (!start || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      if ((multiple || (!open && onSwipeAd)) && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiped.current = true;
        if (!open && onSwipeAd) onSwipeAd(dx < 0 ? 1 : -1);
        else move(dx < 0 ? 1 : -1);
      }
    },
  };

  function arrows() {
    return (
      multiple && (
        <>
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Previous photo"
            className={`${CONTROL} absolute left-3 top-1/2 -translate-y-1/2`}
          >
            <ChevronLeft aria-hidden="true" className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Next photo"
            className={`${CONTROL} absolute right-3 top-1/2 -translate-y-1/2`}
          >
            <ChevronRight aria-hidden="true" className="size-6" />
          </button>
        </>
      )
    );
  }

  if (!photos.length) {
    return (
      <div className="flex h-96 items-center justify-center rounded-card bg-canvas text-sm font-medium text-muted lg:h-[560px]">
        No photos yet
      </div>
    );
  }

  return (
    <>
      <div
        data-photo-gallery
        className="relative flex h-96 flex-col overflow-hidden rounded-card bg-canvas shadow-card lg:h-[560px]"
        {...swipeHandlers}
      >
        {photos[active].verified && (
          <p className="flex shrink-0 items-center gap-1.5 bg-emerald-700 px-3 py-2 text-[10px] font-semibold leading-snug text-white lg:text-xs">
            <BadgeCheck className="size-3.5 shrink-0" aria-hidden="true" />
            Verified picture - this photo has been confirmed as real by Vezlist.
          </p>
        )}
        <button
          ref={trigger}
          type="button"
          aria-label={`Open photo ${active + 1} of ${photos.length} full screen`}
          aria-haspopup="dialog"
          onClick={() => {
            if (swiped.current) {
              swiped.current = false;
              return;
            }
            setOpen(true);
          }}
          className="relative block min-h-0 w-full flex-1 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
        >
          <MediaImage
            discreet
            fill
            preload
            src={photos[active].url}
            alt={`${title} — photo ${active + 1}`}
            sizes="(min-width: 1024px) 620px, 100vw"
            className="object-contain"
          />
          {photos[active].verified && <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-emerald-700/90 px-2 py-1 text-[10px] font-semibold text-white">
            <BadgeCheck className="size-3" aria-hidden="true" /> Verified
          </span>}
          <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
            <Images aria-hidden="true" className="size-4" /> {active + 1}/
            {photos.length}
          </span>
        </button>
        {arrows()}
      </div>
      <div className="mt-2">
        <PhotoGroups photos={photos} active={active} onSelect={setActive} />
      </div>
      {open && (
        <dialog
          ref={dialog}
          aria-label={`${title} photo viewer`}
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              const buttons = Array.from(
                event.currentTarget.querySelectorAll("button:not([disabled])"),
              );
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              move(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black p-0 text-white backdrop:bg-black"
        >
          <div className="mx-auto flex h-full max-w-6xl flex-col px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
            <header className="flex shrink-0 items-center justify-between py-3">
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                aria-label="Close photo viewer"
                className={CONTROL}
              >
                <X aria-hidden="true" className="size-6" />
              </button>
              <span
                aria-live="polite"
                aria-atomic="true"
                className="text-base font-semibold tabular-nums"
              >
                {active + 1}/{photos.length}
              </span>
              <Images aria-hidden="true" className="mx-3 size-5" />
            </header>
            <div className="relative min-h-0 flex-1" {...swipeHandlers}>
              <MediaImage
                discreet
                fill
                loading="eager"
                src={photos[active].url}
                alt={`${title} — photo ${active + 1}`}
                sizes="(min-width: 1152px) 1152px, 100vw"
                className="object-contain"
                style={{ backgroundColor: "transparent" }}
              />
              {arrows()}
            </div>
            {photos[active].verified && <p className="mt-2 text-center text-xs font-semibold text-emerald-400">Verified picture</p>}
            <div className="mt-2 shrink-0">
              <PhotoGroups photos={photos} active={active} onSelect={setActive} dark />
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
