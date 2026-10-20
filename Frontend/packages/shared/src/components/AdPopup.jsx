"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ToastProvider } from "../context/ToastContext.jsx";
import AdDetail from "../pages/AdDetail.jsx";
import { getListingDetail } from "../lib/api/discovery.js";
import { SITE_SCOPE } from "../lib/api/client.js";

const CONTROL =
  "grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand";

/** Opt-in only: the originating feed stays mounted behind the popup. */
export function useAdPopup() {
  const [selection, setSelection] = useState(null);
  function open(id, ids) {
    const snapshot = [...new Set(ids.filter(Boolean))];
    const index = snapshot.indexOf(id);
    if (index >= 0) setSelection({ ids: snapshot, index });
  }
  return {
    open,
    isOpen: selection !== null,
    popup: selection && (
      <AdPopup {...selection} onClose={() => setSelection(null)} />
    ),
  };
}

export default function AdPopup({ ids, index: initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const dialog = useRef(null);
  const cache = useRef(new Map());
  const id = ids[index];
  const gesture = useRef(null);

  function load(id) {
    if (!cache.current.has(id)) {
      const request = getListingDetail(id, SITE_SCOPE).catch((error) => {
        cache.current.delete(id);
        throw error;
      });
      cache.current.set(id, request);
    }
    return cache.current.get(id);
  }
  useEffect(() => {
    // Prefetch data only. Opening the active detail records the view.
    for (const next of [ids[index - 1], ids[index + 1]]) {
      if (next) load(next).catch(() => {});
    }
  }, [ids, index]);

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    const feedScroll = trigger?.closest("[data-scroll]");
    const feedTop = feedScroll?.scrollTop;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previous;
      trigger?.focus({ preventScroll: true });
      if (feedScroll?.isConnected) feedScroll.scrollTop = feedTop;
    };
  }, []);

  useEffect(() => {
    dialog.current
      ?.querySelector('[aria-label="Close ad"]')
      ?.focus({ preventScroll: true });
  }, [index]);

  const restoreControlFocus = useCallback(() => {
    if (
      !dialog.current?.contains(document.activeElement) ||
      document.activeElement === dialog.current
    ) {
      dialog.current
        ?.querySelector('[aria-label="Close ad"]')
        ?.focus({ preventScroll: true });
    }
  }, []);

  function move(delta) {
    // A nested report dialog or full-screen photo viewer owns its own input.
    if (dialog.current.querySelector('[role="dialog"], dialog[open]')) return;
    setIndex((current) =>
      Math.max(0, Math.min(ids.length - 1, current + delta)),
    );
  }
  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={CONTROL}
        aria-label="Previous ad"
        disabled={index === 0}
        onClick={() => move(-1)}
      >
        <ChevronLeft className="size-5" />
      </button>
      <span
        className="min-w-8 text-center text-xs tabular-nums text-muted"
        aria-live="polite"
      >
        {index + 1}/{ids.length}
      </span>
      <button
        type="button"
        className={CONTROL}
        aria-label="Next ad"
        disabled={index === ids.length - 1}
        onClick={() => move(1)}
      >
        <ChevronRight className="size-5" />
      </button>
      <button
        type="button"
        className={CONTROL}
        aria-label="Close ad"
        onClick={onClose}
      >
        <X className="size-5" />
      </button>
    </div>
  );

  return createPortal(
    <dialog
      ref={dialog}
      aria-label="Ad viewer"
      className="fixed inset-0 m-auto h-dvh max-h-dvh w-full max-w-none border-0 bg-canvas p-0 text-ink backdrop:bg-black/50 lg:h-[92dvh] lg:max-w-7xl lg:rounded-card"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!dialog.current.querySelector('[role="dialog"], dialog[open]'))
          onClose();
      }}
      onKeyDown={(event) => {
        const nested = dialog.current.querySelector(
          '[role="dialog"], dialog[open]',
        );
        if (nested) {
          if (
            event.key === "Escape" &&
            nested.getAttribute("role") === "dialog"
          )
            event.preventDefault();
          return;
        }
        if (event.key === "Tab") {
          const stops = [
            ...dialog.current.querySelectorAll(
              'button:not([disabled]), a[href], input, textarea, select, [tabindex="0"]',
            ),
          ].filter(
            (el) => !el.closest("[inert]") && el.getClientRects().length,
          );
          const first = stops[0],
            last = stops.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (
          event.defaultPrevented ||
          event.target.closest(
            'input, textarea, select, [contenteditable="true"], [data-photo-gallery]',
          )
        )
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div
        className="relative flex h-full min-h-0 flex-col"
        onTouchStart={(event) => {
          gesture.current =
            event.touches.length === 1 &&
            !event.target.closest(
              '[data-photo-gallery], dialog[open] dialog, [role="dialog"], button, a, input, textarea',
            )
              ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
              : null;
        }}
        onTouchCancel={() => {
          gesture.current = null;
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 1) gesture.current = null;
        }}
        onTouchEnd={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (!start || !event.changedTouches.length) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
            move(dx < 0 ? 1 : -1);
        }}
      >
        <ToastProvider>
          <AdDetail
            key={id}
            listingId={id}
            onClose={onClose}
            headerActions={actions}
            loadDetail={load}
            onSwipeAd={move}
            onReady={restoreControlFocus}
          />
        </ToastProvider>
      </div>
    </dialog>,
    document.body,
  );
}
