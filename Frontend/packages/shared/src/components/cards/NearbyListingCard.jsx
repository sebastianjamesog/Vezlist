"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { timeAgo } from "../../lib/format";
import MediaImage from "../media/MediaImage.jsx";

/** Compact row — used where the map already eats most of the screen. */
export default function NearbyListingCard({ item }) {
  const verified = item.verified;

  return (
    <Link
      href={`/ad/${item.adId}`}
      className={`group flex items-center gap-3 rounded-card bg-surface p-2.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift ${
        verified ? "verified-glow" : ""
      }`}
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl lg:size-[68px]">
        <MediaImage
          fill
          src={item.image}
          alt={item.title}
          sizes="(min-width: 1024px) 68px, 64px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[15px] font-bold text-ink transition-colors group-hover:text-brand">
            {item.title}
          </h3>
          {verified && (
            <BadgeCheck
              className="size-4 shrink-0 text-emerald-500"
              strokeWidth={2.6}
              aria-label="Verified"
            />
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          {item.price > 0 && (
            <span className="rounded-lg bg-brand-soft px-2 py-0.5 text-[13px] font-bold tabular-nums text-brand">
              ${item.price.toLocaleString()}
            </span>
          )}
          <span className="truncate text-[12px] font-medium text-muted">
            {item.category}
          </span>
        </div>

        <p className="mt-1 text-[11px] text-muted">
          {item.distanceKm.toFixed(1)} km away · {timeAgo(item.postedMsAgo)}
        </p>
      </div>
    </Link>
  );
}
