"use client";

import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import Icon from "../ui/Icon";
import Sparkline from "./Sparkline";
import { tones } from "../../lib/tones";

/**
 * A dashboard tile: label, value, and one piece of context — either a delta or
 * a sparkline, never both. Two trends on one tile is two claims about the same
 * number and the reader has to work out which one to believe.
 *
 * Renders as a link when `to` is passed, because a count is a question and the
 * screen behind it is the answer.
 */
export default function StatCard({
  label,
  value,
  icon,
  tone = "blue",
  delta,
  deltaLabel,
  series,
  to,
}) {
  const up = typeof delta === "number" && delta >= 0;
  const Trend = up ? TrendingUp : TrendingDown;
  const Wrapper = to ? Link : "div";

  return (
    <Wrapper
      {...(to ? { href: to } : {})}
      className={`block rounded-card bg-surface p-4 shadow-card lg:p-5 ${to ? "transition-shadow hover:shadow-lift" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-muted">
            {label}
          </p>
          <p className="mt-1 text-[28px] font-extrabold leading-none text-ink lg:text-[32px]">
            {value}
          </p>
        </div>
        {icon && (
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[tone] ?? tones.blue}`}
          >
            <Icon name={icon} className="size-5" strokeWidth={2.4} />
          </span>
        )}
      </div>

      {series ? (
        <Sparkline values={series} className="mt-3 w-full" />
      ) : typeof delta === "number" ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold">
          <Trend
            className={`size-4 ${up ? "text-emerald-600" : "text-red-600"}`}
            strokeWidth={2.6}
            aria-hidden="true"
          />
          <span className={up ? "text-emerald-600" : "text-red-600"}>
            {up ? "+" : ""}
            {delta}%
          </span>
          {deltaLabel && (
            <span className="font-medium text-muted">{deltaLabel}</span>
          )}
        </p>
      ) : (
        deltaLabel && (
          <p className="mt-3 text-[13px] font-medium text-muted">
            {deltaLabel}
          </p>
        )
      )}
    </Wrapper>
  );
}
