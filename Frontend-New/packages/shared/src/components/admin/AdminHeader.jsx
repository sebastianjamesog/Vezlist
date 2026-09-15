"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Title, count, actions — the four lines every one of the console's screens
 * opens with.
 *
 * A sixth component the build plan did not name. It earns the slot the same
 * way `DataTable` does: the alternative is fifteen copies of the same header
 * markup drifting apart one screen at a time. The public `SubPageBar` is not
 * it — that one is a sticky phone bar with a history-aware back button, and a
 * console has a rail telling you where you are instead.
 */
export default function AdminHeader({
  title,
  subtitle,
  back,
  backLabel = "Back",
  actions,
  className = "",
}) {
  return (
    <header className={`mb-5 ${className}`}>
      {back && (
        <Link
          href={back}
          className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-muted transition-colors hover:text-brand"
        >
          <ChevronLeft className="size-4" strokeWidth={2.6} />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-extrabold leading-tight text-ink lg:text-[30px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[14px] text-muted">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

/** The card every console panel is built out of. */
export const CARD = "rounded-card bg-surface p-4 shadow-card lg:p-5";
