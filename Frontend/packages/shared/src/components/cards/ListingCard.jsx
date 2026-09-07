"use client";

import Link from "next/link";
import { BadgeCheck, MapPin } from "lucide-react";
import { timeAgo } from "../../lib/format";

/**
 * Row tile: thumbnail left, three lines of text right. The feed is one column
 * on mobile and two or three wide, so the row stays scannable at every width.
 *
 * Verified ads carry the travelling emerald ring — the badge names it for
 * anyone who can't see the animation (reduced motion freezes it to a hairline).
 */
export default function ListingCard({ listing }) {
  const verified = listing.verified;

  return (
    <Link
      href={`/ad/${listing.adId}`}
      className={`group relative flex min-w-0 gap-3 rounded-2xl bg-surface p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99] lg:gap-4 lg:p-4 ${
        verified ? "verified-glow" : ""
      }`}
    >
      <div className="size-[72px] shrink-0 overflow-hidden rounded-xl ring-1 ring-line lg:size-[88px]">
        <img
          data-media
          src={listing.image}
          alt={listing.title}
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="min-w-0 flex-1 pr-7 lg:pr-9">
        <h3 className="line-clamp-2 text-[17px] font-bold leading-tight text-ink transition-colors group-hover:text-brand">
          {listing.title}
        </h3>
        {/* Seller and age share a line: the age is short and fixed, so pairing
            them keeps the card three lines tall whatever the title does. */}
        <div className="mt-1 flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted lg:text-[13px]">
            {listing.business}
          </p>
          <span className="shrink-0 text-[11px] text-muted lg:text-[12px]">
            {timeAgo(listing.postedMsAgo)}
          </span>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-1.5 lg:mt-3">
          {listing.price > 0 && (
            <span className="shrink-0 rounded-lg bg-brand-soft px-2 py-0.5 text-[13px] font-bold tabular-nums text-brand">
              ${listing.price.toLocaleString()}
            </span>
          )}
          <span className="truncate text-[12px] font-medium text-muted lg:text-[13px]">
            {listing.category}
          </span>
          <span className="shrink-0 text-[12px] text-muted">·</span>
          <span className="flex min-w-0 items-center gap-0.5 rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted lg:text-[12px]">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{listing.location}</span>
          </span>
        </div>
      </div>

      {verified && (
        <span className="absolute right-3 top-3 text-emerald-500 lg:right-4 lg:top-4">
          <BadgeCheck className="size-[22px]" strokeWidth={2.5} />
          <span className="sr-only">Verified listing</span>
        </span>
      )}
    </Link>
  );
}
