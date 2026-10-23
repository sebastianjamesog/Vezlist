"use client";

import { openAdClick } from "../../lib/openAdClick.js";
import Link from "next/link";
import { BadgeCheck, ChevronRight, Eye, ImageOff, MapPin } from "lucide-react";
import { compactCount, timeAgo } from "../../lib/format";
import ListingStatusBadges from "./ListingStatusBadges.jsx";
import MediaImage from "../media/MediaImage.jsx";
import PhotoMark from "../media/PhotoMark.jsx";
import useLiveViewCount from "../../lib/useLiveViewCount.js";

function compactPostedTime(msAgo) {
  if (msAgo >= 86_400_000) return `${Math.floor(msAgo / 86_400_000)}d ago`;
  if (msAgo >= 3_600_000) return `${Math.floor(msAgo / 3_600_000)}h ago`;
  if (msAgo >= 60_000) return `${Math.floor(msAgo / 60_000)} min ago`;
  return "Just now";
}

/** Compact row shared by Browse, featured feeds, saved ads, and seller pages. */
export default function ListingCard({ listing, chevron = false, onOpen }) {
  const targetId = listing.id ?? listing.adId;
  const hasImage = Boolean(listing.image);
  const price = Number(listing.price ?? 0);
  const views = useLiveViewCount(targetId, listing.views ?? listing.viewCount, listing.site);

  return (
    <article
      className={`listing-card group relative min-w-0 rounded-2xl bg-surface shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99] ${
        listing.verified ? "verified-glow" : ""
      }`}
    >
      <Link onClick={onOpen ? (event) => openAdClick(event, () => onOpen(targetId)) : undefined} href={`/ad/${targetId}`} className="listing-card__link flex min-w-0 items-center gap-2 rounded-2xl p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <div className="listing-card__photo relative size-[104px] shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
          {hasImage ? (
            <>
              <MediaImage
                discreet
                fill
                src={listing.image}
                alt={listing.title}
                sizes="(min-width: 1024px) 120px, 104px"
                className="origin-top object-cover object-top transition-transform duration-300 group-hover:scale-105"
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

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 self-stretch">
          <ListingStatusBadges listing={listing} className="-mb-0.5" />
          <h3 className="listing-card__title line-clamp-2 break-words text-[17px] font-bold leading-5 text-ink transition-colors group-hover:text-brand">
            {listing.title}
          </h3>

          <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px] leading-4 text-muted">
            <p className="min-w-0 max-w-full truncate font-medium" title={listing.business}>{listing.business}</p>
            {listing.age != null && (
              <span className="shrink-0 font-semibold tabular-nums">{listing.age}</span>
            )}
            {listing.verified && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold leading-3 text-emerald-800" title="Verified ad">
                <BadgeCheck aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                <span>VERIFIED</span>
              </span>
            )}
            {listing.postedMsAgo != null && (
              <span className="inline-flex shrink-0 items-center gap-1" title={timeAgo(listing.postedMsAgo)}>
                {listing.business && <span aria-hidden="true">·</span>}
                {compactPostedTime(listing.postedMsAgo)}
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {price > 0 && (
              <span className="max-w-full break-words text-[13px] font-medium leading-5 tabular-nums text-muted">
                ${price.toLocaleString()}
              </span>
            )}
            {listing.category && (
              <span className="min-w-0 truncate text-[13px] leading-5 text-muted" title={listing.category}>
                {listing.category}
              </span>
            )}
            {listing.ethnicity && (
              <span className="min-w-0 truncate rounded-md bg-canvas px-1 text-[12px] leading-5 text-muted" title={listing.ethnicity}>
                {listing.ethnicity}
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2 text-[12px] leading-4 text-muted">
            {listing.location && (
              <span className="inline-flex min-w-0 flex-1 items-center gap-1" title={listing.location}>
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{listing.location}</span>
              </span>
            )}
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums"
              aria-label={views == null ? "View count unavailable" : `${compactCount(views)} views`}
            >
              <Eye className="size-3.5 shrink-0" aria-hidden="true" />
              {views == null ? "—" : compactCount(views)}
            </span>
          </div>
        </div>
        {chevron && (
          <ChevronRight aria-hidden="true" className="listing-card__chevron my-auto hidden size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        )}
      </Link>

    </article>
  );
}
