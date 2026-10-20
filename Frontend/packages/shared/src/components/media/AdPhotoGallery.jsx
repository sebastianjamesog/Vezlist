"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import MediaImage from "./MediaImage.jsx";

const CONTROL =
  "grid size-11 shrink-0 place-items-center rounded-full border border-white/50 bg-black/55 text-white hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

function Thumbnails({ photos, active, onSelect, dark = false }) {
  const strip = useRef(null);
  useEffect(() => {
    const button = strip.current?.children[active];
    if (!button) return;
    // Scroll only the strip; scrollIntoView would also move the ad page.
    const left = button.offsetLeft;
    if (left < strip.current.scrollLeft) strip.current.scrollLeft = left;
    else if (
      left + button.offsetWidth >
      strip.current.scrollLeft + strip.current.clientWidth
    ) {
      strip.current.scrollLeft =
        left + button.offsetWidth - strip.current.clientWidth;
    }
  }, [active]);

  return (
    <div
      ref={strip}
      aria-label="Photo thumbnails"
      className="no-scrollbar relative flex gap-2 overflow-x-auto p-1"
    >
      {photos.map((src, index) => (
        <button
          key={`${src}-${index}`}
          type="button"
          onClick={() => onSelect(index)}
          aria-label={`Show photo ${index + 1}`}
          aria-current={index === active ? "true" : undefined}
          className={`relative size-20 shrink-0 overflow-hidden rounded-xl border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:size-24 ${index === active ? "border-brand ring-2 ring-brand" : dark ? "border-white/20" : "border-line"}`}
        >
          <MediaImage
            discreet
            fill
            src={src}
            alt=""
            sizes="96px"
            className="object-cover object-top"
          />
        </button>
      ))}
    </div>
  );
}

export default function AdPhotoGallery({ photos, title, onSwipeAd }) {
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
        className="relative h-96 overflow-hidden rounded-card bg-canvas shadow-card lg:h-[560px]"
        {...swipeHandlers}
      >
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
          className="relative block size-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
        >
          <MediaImage
            discreet
            fill
            preload
            src={photos[active]}
            alt={`${title} — photo ${active + 1}`}
            sizes="(min-width: 1024px) 620px, 100vw"
            className="object-contain"
          />
          <span className="absolute bottom-3 right-3 flex items-center gap-2 rounded-xl bg-black/70 px-3 py-2 text-sm font-semibold text-white">
            <Images aria-hidden="true" className="size-4" /> {active + 1}/
            {photos.length}
          </span>
        </button>
        {arrows()}
      </div>
      {multiple && (
        <div className="mt-2">
          <Thumbnails photos={photos} active={active} onSelect={setActive} />
          <div
            className="flex flex-wrap justify-center"
            aria-label="Choose photo"
          >
            {photos.map((src, index) => (
              <button
                key={`${src}-${index}`}
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Go to photo ${index + 1}`}
                aria-current={index === active ? "true" : undefined}
                className="grid size-8 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-brand"
              >
                <span
                  className={`size-2 rounded-full ${index === active ? "bg-brand" : "bg-line"}`}
                />
              </button>
            ))}
          </div>
        </div>
      )}
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
                src={photos[active]}
                alt={`${title} — photo ${active + 1}`}
                sizes="(min-width: 1152px) 1152px, 100vw"
                className="object-contain"
                style={{ backgroundColor: "transparent" }}
              />
              {arrows()}
            </div>
            {multiple && (
              <div className="mt-3 shrink-0">
                <Thumbnails
                  photos={photos}
                  active={active}
                  onSelect={setActive}
                  dark
                />
              </div>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
