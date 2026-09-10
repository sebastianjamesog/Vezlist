"use client";

import Link from "next/link";
import { Bell, ChevronLeft, Coins } from "lucide-react";
import Wordmark from "./Wordmark";
import { useNotifications } from "../../context/NotificationsContext";

/**
 * Glass app bar. Mobile carries the wordmark and two actions; on desktop the
 * wordmark lives in the rail, so this shows the page title instead.
 */
export default function TopBar({
  variant = "brand",
  title,
  credits = 100,
  onBack,
  onPostAd,
  onExit,
  exitHref,
  exitLabel = "Home",
}) {
  const { count, countError } = useNotifications();
  // The personals site is a separate origin, so its way out is a real
  // navigation; onExit stays for same-origin callers.
  const exitClass =
    "flex shrink-0 items-center gap-1 rounded-full bg-surface py-2 pl-2 pr-3.5 text-[14px] font-bold text-ink shadow-card transition-transform hover:scale-105 active:scale-95";
  if (variant === "detail") {
    return (
      <header className="glass sticky top-0 z-30 shrink-0 px-2 py-2 lg:px-6 lg:py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-1">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card transition-transform hover:scale-105 active:scale-95"
          >
            <ChevronLeft className="size-5" strokeWidth={2.6} />
          </button>

          <h1 className="min-w-0 flex-1 truncate px-2 text-[16px] font-bold text-ink lg:text-[18px]">
            {title ?? "Ad details"}
          </h1>

          <button
            onClick={onPostAd}
            className="shrink-0 rounded-full bg-brand-soft px-4 py-2 text-[14px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
          >
            Post
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="glass sticky top-0 z-30 shrink-0 px-4 py-2.5 lg:px-6 lg:py-3.5">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
        {/* A site you have to leave deliberately (Personals) swaps the
            wordmark for the way out; otherwise the wordmark is the way home. */}
        {exitHref ? (
          <a href={exitHref} className={exitClass}>
            <ChevronLeft className="size-5" strokeWidth={2.6} />
            {exitLabel}
          </a>
        ) : onExit ? (
          <button onClick={onExit} className={exitClass}>
            <ChevronLeft className="size-5" strokeWidth={2.6} />
            {exitLabel}
          </button>
        ) : (
          <Link href="/" aria-label="Home" className="shrink-0 lg:hidden">
            <Wordmark nameOnly />
          </Link>
        )}
        <h1 className="hidden min-w-0 flex-1 truncate text-[22px] font-extrabold text-ink lg:block">
          {title}
        </h1>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/profile/notifications"
            aria-label={
              count > 0 && !countError
                ? `Notifications, ${count} unread`
                : "Notifications"
            }
            className="relative grid size-10 place-items-center rounded-full bg-surface text-ink shadow-card transition-transform hover:scale-105 active:scale-95"
          >
            <Bell className="size-[19px]" strokeWidth={2.1} />
            {count > 0 && !countError && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold text-white ring-2 ring-surface"
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>

          <Link
            href="/profile"
            aria-label={`${credits} credits`}
            className="flex h-10 items-center gap-1.5 rounded-full bg-brand-soft px-3.5 text-brand transition-colors hover:bg-brand hover:text-on-brand"
          >
            <Coins className="size-4" strokeWidth={2.4} />
            <span className="text-[14px] font-bold tabular-nums">
              {credits}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
