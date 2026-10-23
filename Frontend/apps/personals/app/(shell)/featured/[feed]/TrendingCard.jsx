"use client";

import { openAdClick } from "@vezlist/shared/lib/openAdClick.js";
import ListingStatusBadges from "@vezlist/shared/components/cards/ListingStatusBadges.jsx";
import Link from "next/link";
import { BadgeCheck, Eye, Heart, ImageOff } from "lucide-react";
import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";
import { compactCount } from "@vezlist/shared/lib/format.js";
import useLiveViewCount from "@vezlist/shared/lib/useLiveViewCount.js";

function initials(name) {
  const words = name.replace(/\([^)]*\)/g, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase() || "?";
}

export default function TrendingCard({ listing, rank, onOpen }) {
  const name = listing.businessName || listing.title || "Creator";
  const views = useLiveViewCount(listing.id, listing.viewCount, listing.site);
  const saves = listing.saveCount;

  return (
    <article className="group relative min-w-0 overflow-hidden rounded-lg bg-slate-800">
      <Link
        onClick={onOpen ? (event) => openAdClick(event, () => onOpen(listing.id)) : undefined}
        href={`/ad/${listing.id}`}
        aria-label={`Number ${rank}: ${name}. View ad`}
        className="relative block aspect-[4/5] overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      >
        {listing.imageUrl ? (
          <MediaImage
            discreet
            fill
            src={listing.imageUrl}
            alt={listing.title || name}
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, 33vw"
            loading={rank <= 3 ? "eager" : "lazy"}
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-700 text-white/80">
            <ImageOff className="size-6" aria-hidden="true" />
            <span className="text-[10px]">No photo yet</span>
          </span>
        )}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/5 to-transparent" />
        <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1 py-0.5 text-[9px] font-bold leading-none text-white lg:text-[11px]">
          #{rank}
        </span>

        <ListingStatusBadges listing={listing} className="absolute right-1 top-1 max-w-[75%] flex-col items-end" />
        <div className="absolute inset-x-0 bottom-0 p-1.5 text-white lg:p-2">
          <div className="flex min-w-0 items-center gap-1">
            <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center rounded-full bg-brand text-[8px] font-bold ring-1 ring-white/60 lg:size-5 lg:text-[9px]">
              {initials(name)}
            </span>
            <h2 className="min-w-0 truncate text-[10px] font-bold leading-4 lg:text-xs" title={name}>{name}</h2>
            {listing.verified && <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-900/90 px-1 text-[7px] font-bold leading-3 text-white" aria-label="Verified ad"><BadgeCheck className="size-2.5" aria-hidden="true" />VERIFIED</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[9px] font-medium leading-3 tabular-nums text-white/95 lg:text-[11px] lg:leading-4">
            <span className="inline-flex items-center gap-0.5" aria-label={views == null ? "View count unavailable" : `${views} views`}>
              <Eye className="size-2.5 shrink-0 lg:size-3" aria-hidden="true" />
              {views == null ? "—" : compactCount(views)}
            </span>
            <span className="inline-flex items-center gap-0.5" aria-label={saves == null ? "Save count unavailable" : `${saves} saves`}>
              <Heart className="size-2.5 shrink-0 lg:size-3" aria-hidden="true" />
              {saves == null ? "—" : compactCount(saves)}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
