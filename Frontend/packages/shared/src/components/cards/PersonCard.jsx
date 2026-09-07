"use client";

import Link from "next/link";
import { BadgeCheck, MapPin, ShieldCheck, Star } from "lucide-react";

const badges = {
  verified: { Icon: BadgeCheck, className: "text-sky-400" },
  shield: { Icon: ShieldCheck, className: "text-emerald-400" },
  star: { Icon: Star, className: "text-amber-300 fill-amber-300" },
};

/**
 * `tile` is the discovery grid (photo-led, like every dating feed); `row` is the
 * compact list that shares the Nearby sheet with the map.
 */
export default function PersonCard({ person, variant = "row" }) {
  const { Icon, className } = badges[person.badge] ?? badges.verified;
  const available = person.status === "available";

  if (variant === "tile") {
    return (
      <Link
        href="/ad/a2"
        className="group relative aspect-[3/4] overflow-hidden rounded-card shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
      >
        <img
          src={person.avatar}
          alt={person.name}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/85 via-ink/30 to-transparent" />

        <span
          className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm ${
            available ? "bg-emerald-500/90" : "bg-amber-500/90"
          }`}
        >
          <span className="size-1.5 rounded-full bg-white" />
          {available ? "Online" : "Busy"}
        </span>

        <div className="absolute inset-x-0 bottom-0 p-3 text-white">
          <div className="flex items-center gap-1">
            <h3 className="truncate text-[15px] font-bold">
              {person.name}, {person.age}
            </h3>
            <Icon
              className={`size-4 shrink-0 ${className}`}
              strokeWidth={2.6}
            />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-white/85">
            <MapPin className="size-3" strokeWidth={2.4} />
            {person.distanceKm} km away
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/ad/a2"
      className="group flex gap-3 rounded-card bg-surface p-2.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative shrink-0 self-start">
        <img
          src={person.avatar}
          alt={person.name}
          loading="lazy"
          className="size-16 rounded-2xl object-cover"
        />
        <span
          className={`absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-surface ${
            available ? "bg-emerald-500" : "bg-amber-400"
          }`}
        />
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[15px] font-bold text-ink transition-colors group-hover:text-brand">
            {person.name}, {person.age}
          </h3>
          <Icon className={`size-4 shrink-0 ${className}`} strokeWidth={2.5} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-lg bg-brand-soft px-2 py-0.5 text-[12px] font-bold text-brand">
            {person.distanceKm} km
          </span>
          <span
            className={`flex items-center gap-1.5 text-[12px] font-semibold ${
              available ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            <span
              className={`size-2 rounded-full ${available ? "bg-emerald-500" : "bg-amber-400"}`}
            />
            {available ? "Available now" : "Busy"}
          </span>
        </div>

        <p className="mt-1 truncate text-[11px] text-muted">
          {person.activeLabel}
        </p>
      </div>
    </Link>
  );
}
