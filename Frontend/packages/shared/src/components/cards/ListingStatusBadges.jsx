"use client";

import { useEffect, useState } from "react";

/** Status expires even when a reader leaves a feed open. Never trust a bare availability flag. */
export default function ListingStatusBadges({ listing, className = "" }) {
  const [now, setNow] = useState(() => Date.now());
  const published = Date.parse(listing.publishedAt ?? "");
  const until = Date.parse(listing.availableUntil ?? "");
  useEffect(() => setNow(Date.now()), [published, until, listing.availableNow]);
  const isNew = Number.isFinite(published) && published <= now && now < published + 86_400_000;
  const available = listing.availableNow === true && Number.isFinite(until) && until > now;
  useEffect(() => {
    const deadlines = [published + 86_400_000, listing.availableNow ? until : NaN].filter((at) => Number.isFinite(at) && at > Date.now());
    if (!deadlines.length) return undefined;
    const timeout = setTimeout(() => setNow(Date.now()), Math.min(...deadlines) - Date.now() + 5);
    return () => clearTimeout(timeout);
  }, [published, until, listing.availableNow, now]);
  if (!isNew && !available) return null;
  return <span className={`flex flex-wrap items-center justify-end gap-1 ${className}`}>
    {available && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold leading-3 text-emerald-800"><span aria-hidden="true" className="size-1 rounded-full bg-emerald-600" />Available now</span>}
    {isNew && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold leading-3 text-amber-800">NEW</span>}
  </span>;
}
