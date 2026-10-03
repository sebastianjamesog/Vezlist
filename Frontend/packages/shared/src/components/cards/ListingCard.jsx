"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronRight, Eye, Heart, ImageOff, MapPin } from "lucide-react";
import { compactCount, timeAgo } from "../../lib/format";
import MediaImage from "../media/MediaImage.jsx";
import PhotoMark from "../media/PhotoMark.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSaved } from "../../context/SavedContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import useLiveViewCount from "../../lib/useLiveViewCount.js";

/** Compact row shared by Browse, featured feeds, saved ads, and seller pages. */
export default function ListingCard({ listing, chevron = false }) {
  const targetId = listing.id ?? listing.adId;
  const { signedIn } = useAuth();
  const { isSaved, toggle } = useSaved();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const saved = isSaved(targetId);
  const hasImage = Boolean(listing.image);
  const price = Number(listing.price ?? 0);
  const views = useLiveViewCount(targetId, listing.views ?? listing.viewCount, listing.site);

  function onToggleSave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!signedIn) {
      toast("Sign in to save ads");
      return;
    }
    if (pending) return;
    setPending(true);
    toggle(targetId)
      .catch(() => toast("Couldn't update saved ads — try again"))
      .finally(() => setPending(false));
  }

  return (
    <article
      className={`listing-card group relative min-w-0 rounded-2xl bg-surface shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99] ${
        listing.verified ? "verified-glow" : ""
      }`}
    >
      <Link href={`/ad/${targetId}`} className="listing-card__link flex min-w-0 items-center gap-2 rounded-2xl p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <div className="listing-card__photo relative size-[104px] shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
          {hasImage ? (
            <>
              <MediaImage
                discreet
                fill
                src={listing.image}
                alt={listing.title}
                sizes="(min-width: 1024px) 120px, 104px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <PhotoMark src={listing.image} className="bottom-1 right-1.5 text-[8px]" />
            </>
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 text-muted">
              <ImageOff className="size-6" aria-hidden="true" />
              <span className="text-[10px] font-medium">No photo yet</span>
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center self-stretch">
          <h3 className="listing-card__title line-clamp-2 min-h-9 text-[15px] font-bold leading-[18px] text-ink transition-colors group-hover:text-brand">
            {listing.title}
          </h3>

          <div className="listing-card__meta mt-0.5 flex h-[18px] min-w-0 items-center gap-1">
            <p className="min-w-0 truncate text-[11px] font-medium text-muted lg:text-[12px]">{listing.business}</p>
            {listing.age != null && (
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink lg:text-[12px]">{listing.age}</span>
            )}
            {listing.verified && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-emerald-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 lg:text-[10px]">
                <BadgeCheck className="size-3" strokeWidth={2.5} />
                Verified
              </span>
            )}
            {listing.postedMsAgo != null && (
              <span className="ml-auto shrink-0 text-[10px] text-muted lg:text-[11px]">{timeAgo(listing.postedMsAgo)}</span>
            )}
          </div>

          <div className="listing-card__meta mt-0.5 flex h-[18px] min-w-0 items-center gap-1">
            {price > 0 && (
              <span className="inline-flex h-[18px] shrink-0 items-center rounded-lg bg-brand-soft px-1.5 text-[12px] font-bold tabular-nums text-brand lg:text-[13px]">
                ${price.toLocaleString()}
              </span>
            )}
            {listing.ethnicity ? (
              <span className="inline-flex h-[18px] max-w-16 min-w-0 items-center rounded-md bg-canvas px-1 text-[11px] font-medium text-muted lg:text-[12px]">
                <span className="truncate">{listing.ethnicity}</span>
              </span>
            ) : (
              <span className="max-w-16 min-w-0 truncate text-[11px] font-medium text-muted lg:text-[12px]">
                {listing.category}
              </span>
            )}
            {listing.location && (
              <span className="inline-flex min-w-3 flex-1 items-center gap-0.5 text-[11px] font-medium text-muted lg:text-[12px]" title={listing.location}>
                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{listing.location}</span>
              </span>
            )}
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums text-muted lg:text-[12px]"
              aria-label={views == null ? "View count unavailable" : `${compactCount(views)} views`}
            >
              <Eye className="size-3 shrink-0" aria-hidden="true" />
              {views == null ? "—" : compactCount(views)}
            </span>
          </div>
        </div>
        {chevron && (
          <ChevronRight aria-hidden="true" className="listing-card__chevron my-auto hidden size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        )}
      </Link>

      <button
        type="button"
        onClick={onToggleSave}
        disabled={pending}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved" : "Save this ad"}
        className="listing-card__save absolute left-[72px] top-3 z-10 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
      >
        <Heart className={`size-4 ${saved ? "fill-current text-rose-300" : ""}`} strokeWidth={2.2} />
      </button>
    </article>
  );
}
