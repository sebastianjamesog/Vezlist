"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  BadgeCheck,
  Eye,
  Heart,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSaved } from "../context/SavedContext.jsx";
import { ToastProvider, useToast } from "../context/ToastContext.jsx";
import { getListingDetail } from "../lib/api/discovery.js";
import { getSellerProfile } from "../lib/api/sellers.js";
import { recordListingView } from "../lib/api/views.js";
import { SITE_SCOPE } from "../lib/api/client.js";
import { IS_PERSONALS } from "../lib/sites.js";
import { compactCount, timeAgo } from "../lib/format.js";
import { publishLiveViewCount } from "../lib/useLiveViewCount.js";
import MediaImage from "./media/MediaImage.jsx";
import AdDetail from "../pages/AdDetail.jsx";

const CONTROL =
  "grid size-11 shrink-0 place-items-center rounded-full border border-white/40 bg-black/60 text-white disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Native scroll snapping keeps touch, wheel and trackpad gestures consistent. */
export default function TrendingAdViewer({
  ids,
  index: initialIndex,
  onClose,
}) {
  const [index, setIndex] = useState(initialIndex);
  const [detailOpen, setDetailOpen] = useState(false);
  const dialog = useRef(null);
  const scroller = useRef(null);
  const closeButton = useRef(null);
  const contactButton = useRef(null);
  const cache = useRef(new Map());
  const recorded = useRef(new Set());
  const engagement = useRef(new Map());
  const indexRef = useRef(initialIndex);

  const load = useCallback((id) => {
    if (!cache.current.has(id)) {
      const request = getListingDetail(id, SITE_SCOPE).catch((error) => {
        cache.current.delete(id);
        throw error;
      });
      cache.current.set(id, request);
    }
    return cache.current.get(id);
  }, []);

  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    const feedScroll = trigger?.closest("[data-scroll]");
    const feedTop = feedScroll?.scrollTop;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    scroller.current.scrollTop = initialIndex * scroller.current.clientHeight;
    closeButton.current?.focus({ preventScroll: true });
    const resize = new ResizeObserver(() => {
      const viewport = scroller.current;
      if (viewport)
        viewport.scrollTop = indexRef.current * viewport.clientHeight;
    });
    resize.observe(scroller.current);
    return () => {
      resize.disconnect();
      element.close();
      document.body.style.overflow = overflow;
      trigger?.focus({ preventScroll: true });
      if (feedScroll?.isConnected) feedScroll.scrollTop = feedTop;
    };
  }, []);

  useEffect(() => {
    const focused = document.activeElement;
    if (focused?.closest('section[aria-hidden="true"]')) {
      closeButton.current?.focus({ preventScroll: true });
    }
  }, [index]);

  function move(delta) {
    if (detailOpen) return;
    const next = Math.max(0, Math.min(ids.length - 1, index + delta));
    scroller.current.scrollTo({
      top: next * scroller.current.clientHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  function closeDetail() {
    setDetailOpen(false);
    requestAnimationFrame(() =>
      contactButton.current?.focus({ preventScroll: true }),
    );
  }

  return createPortal(
    <dialog
      ref={dialog}
      aria-label="Trending ad viewer"
      className="fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-black p-0 text-white backdrop:bg-black"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (dialog.current.querySelector('[role="dialog"], dialog[open]'))
          return;
        if (detailOpen) closeDetail();
        else onClose();
      }}
      onKeyDown={(event) => {
        if (
          detailOpen ||
          event.defaultPrevented ||
          event.target.closest(
            'input, textarea, select, [contenteditable="true"]',
          )
        )
          return;
        if (
          ["ArrowDown", "PageDown", "ArrowUp", "PageUp"].includes(event.key)
        ) {
          event.preventDefault();
          move(event.key === "ArrowDown" || event.key === "PageDown" ? 1 : -1);
        }
      }}
    >
      <ToastProvider>
        <div
          className="relative mx-auto h-full w-full max-w-xl"
          inert={detailOpen ? true : undefined}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <span
              className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold tabular-nums"
              aria-live="polite"
            >
              Trending · {index + 1}/{ids.length}
            </span>
            <button
              ref={closeButton}
              type="button"
              aria-label="Close ad"
              onClick={onClose}
              className={`${CONTROL} pointer-events-auto`}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3">
            <button
              type="button"
              aria-label="Previous ad"
              disabled={index === 0}
              onClick={() => move(-1)}
              className={CONTROL}
            >
              <ArrowUp className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Next ad"
              disabled={index === ids.length - 1}
              onClick={() => move(1)}
              className={CONTROL}
            >
              <ArrowDown className="size-5" />
            </button>
          </div>
          <div
            ref={scroller}
            aria-label="Trending ads"
            className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-none touch-pan-y"
            onScroll={(event) => {
              const viewport = event.currentTarget;
              if (!viewport.clientHeight) return;
              const next = Math.max(
                0,
                Math.min(
                  ids.length - 1,
                  Math.round(viewport.scrollTop / viewport.clientHeight),
                ),
              );
              indexRef.current = next;
              setIndex(next);
            }}
          >
            {ids.map((id, position) => (
              <section
                key={id}
                aria-label={`Ad ${position + 1} of ${ids.length}`}
                aria-hidden={position !== index ? true : undefined}
                inert={position !== index ? true : undefined}
                className="relative h-full min-h-full snap-start snap-always overflow-hidden bg-black"
              >
                {Math.abs(position - index) <= 1 && (
                  <AdSlide
                    id={id}
                    active={position === index && !detailOpen}
                    load={load}
                    recorded={recorded}
                    engagement={engagement}
                    contactRef={position === index ? contactButton : undefined}
                    onContact={() => setDetailOpen(true)}
                  />
                )}
              </section>
            ))}
          </div>
        </div>
        {detailOpen && (
          <div className="absolute inset-0 z-30 flex min-h-0 flex-col bg-canvas text-ink">
            <AdDetail
              listingId={ids[index]}
              loadDetail={load}
              onClose={closeDetail}
              headerActions={
                <button
                  autoFocus
                  type="button"
                  onClick={closeDetail}
                  aria-label="Back to Trending viewer"
                  className="flex min-h-11 items-center gap-2 rounded-full bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <ArrowLeft className="size-4" />
                  Trending
                </button>
              }
            />
          </div>
        )}
      </ToastProvider>
    </dialog>,
    document.body,
  );
}

function AdSlide({
  id,
  active,
  load,
  recorded,
  engagement,
  contactRef,
  onContact,
}) {
  const [listing, setListing] = useState(null);
  const [seller, setSeller] = useState(null);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const [likeDelta, setLikeDelta] = useState(
    () => engagement.current.get(id)?.likeDelta ?? 0,
  );
  const { signedIn } = useAuth();
  const { isSaved, toggle } = useSaved();
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    load(id)
      .then((row) => {
        if (cancelled) return;
        setListing({
          ...row,
          viewCount: engagement.current.get(id)?.viewCount ?? row.viewCount,
        });
        return getSellerProfile(row.ownerId, { site: SITE_SCOPE, limit: 1 })
          .then((response) => {
            if (!cancelled) setSeller(response?.seller ?? null);
          })
          .catch(() => {});
      })
      .catch((caught) => {
        if (!cancelled) setError(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [id, load, retry]);

  useEffect(() => {
    if (!active || !listing || recorded.current.has(id)) return;
    // A fast pass while scrolling does not count as opening an ad; prefetched
    // neighbors never record views. Personals still respects the age gate.
    const timer = setTimeout(() => {
      if (IS_PERSONALS && document.documentElement.dataset.ageGate !== "ok")
        return;
      if (recorded.current.has(id)) return;
      recorded.current.add(id);
      recordListingView(id, SITE_SCOPE, crypto.randomUUID())
        .then(({ viewCount }) => {
          engagement.current.set(id, {
            ...engagement.current.get(id),
            viewCount,
          });
          publishLiveViewCount(id, viewCount, SITE_SCOPE);
          setListing((current) => ({ ...current, viewCount }));
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [active, id, listing?.id, recorded]);

  async function like() {
    if (!signedIn) return toast("Sign in to like ads");
    if (pending) return;
    const delta = isSaved(id) ? -1 : 1;
    setPending(true);
    try {
      await toggle(id);
      setLikeDelta((value) => {
        const next = value + delta;
        engagement.current.set(id, {
          ...engagement.current.get(id),
          likeDelta: next,
        });
        return next;
      });
    } catch {
      toast("Couldn't update your like. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (error)
    return (
      <div className="grid h-full place-content-center gap-4 px-8 text-center">
        <p>
          {error.status === 404 || error.status === 403
            ? "This ad is no longer available."
            : "Couldn't load this ad."}
        </p>
        <button
          type="button"
          className="rounded-full border border-white/50 px-4 py-3 focus-visible:outline-2 focus-visible:outline-white"
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry
        </button>
        <p className="text-sm text-white/70">Scroll to browse the next ad.</p>
      </div>
    );
  if (!listing)
    return (
      <div
        className="grid h-full place-items-center bg-slate-950"
        role="status"
      >
        <span className="text-sm text-white/70">Loading ad…</span>
      </div>
    );
  const photos = (listing.media ?? [])
    .filter((photo) => photo.status === "READY" && photo.url)
    .sort((a, b) => a.position - b.position);
  const photo = photos.find((item) => item.cover) ?? photos[0];
  return (
    <>
      {photo ? (
        <MediaImage
          discreet={IS_PERSONALS}
          fill
          src={photo.url}
          alt={listing.title}
          sizes="(min-width: 576px) 576px, 100vw"
          loading="eager"
          className="object-contain"
          style={{ backgroundColor: "#000" }}
        />
      ) : (
        <div className="grid h-full place-items-center bg-slate-950 text-white/60">
          No photo available
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-black/80"
      />
      <div className="absolute inset-x-0 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] px-4 pr-16">
        <div className="flex items-center gap-2">
          {seller?.avatarUrl && (
            <MediaImage
              width={36}
              height={36}
              src={seller.avatarUrl}
              alt=""
              className="size-9 rounded-full object-cover"
            />
          )}
          <p className="truncate text-base font-bold">
            {seller?.displayName || listing.businessName || listing.title}
          </p>
          {listing.verified && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-300">
              <BadgeCheck className="size-3" />
              Verified
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-white/80">
          {[listing.locationLabel, listing.provinceLabel]
            .filter(Boolean)
            .join(", ")}
        </p>
        {listing.publishedAt && (
          <p className="mt-1 text-xs text-white/70">
            {timeAgo(Date.now() - new Date(listing.publishedAt).getTime())}
          </p>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
        <h2 className="mb-3 line-clamp-2 text-lg font-bold leading-snug">
          {listing.title}
        </h2>
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1 text-sm tabular-nums">
            <p className="flex items-center gap-2">
              <Eye className="size-5" />
              <span>{compactCount(listing.viewCount ?? 0)} views</span>
            </p>
            <button
              type="button"
              aria-label={isSaved(id) ? "Unlike ad" : "Like ad"}
              aria-pressed={isSaved(id)}
              disabled={pending}
              onClick={like}
              className="flex min-h-11 items-center gap-2 rounded-lg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-white"
            >
              <Heart
                className={`size-5 ${isSaved(id) ? "fill-rose-500 text-rose-500" : ""}`}
              />
              <span>
                {compactCount(
                  Math.max(0, (listing.saveCount ?? 0) + likeDelta),
                )}{" "}
                likes
              </span>
            </button>
          </div>
          <button
            ref={contactRef}
            type="button"
            onClick={onContact}
            className="mb-1 min-h-11 rounded-xl brand-gradient px-4 py-3 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            View Contact Info
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-white/65">
          Swipe up or down to browse ads
        </p>
      </div>
    </>
  );
}
