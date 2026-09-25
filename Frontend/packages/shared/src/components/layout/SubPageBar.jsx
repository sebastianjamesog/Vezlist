"use client";

import { useNavigate } from "../../lib/nav";
import { ChevronLeft } from "lucide-react";

/**
 * Header for every screen you reach from another screen: back + title + optional action.
 * `plain` drops the frosted bar and lets the header scroll away with the page,
 * for screens that sit straight on the canvas with no card behind them.
 */
export default function SubPageBar({
  title,
  subtitle,
  action,
  fallback = "/",
  plain = false,
}) {
  const navigate = useNavigate();

  return (
    <header
      className={`px-4 py-3 lg:px-8 lg:py-4 ${plain ? "" : "glass sticky top-0 z-30"}`}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
        <button
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate(fallback)
          }
          aria-label="Go back"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card transition-transform hover:scale-105 active:scale-95"
        >
          <ChevronLeft className="size-5" strokeWidth={2.6} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] font-extrabold leading-tight text-ink lg:text-[24px]">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-[13px] text-muted">{subtitle}</p>
          )}
        </div>

        {action}
      </div>
    </header>
  );
}
