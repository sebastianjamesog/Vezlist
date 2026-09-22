"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronLeft } from "lucide-react";
import { useAccount } from "../../context/AccountContext";
import { useAuth } from "../../context/AuthContext";
import { getUnreadCount } from "../../lib/api/notifications";

/**
 * Glass app bar, in two variants that are answering two different questions.
 *
 * `detail` is navigation — a back arrow on a screen you reached from another
 * one — so it renders at every width. It is the only way out of an ad page on
 * a phone, and hiding it would strand you there.
 *
 * `brand` is chrome. On a phone it was a title you already knew (the tab bar
 * says which tab you are on), a wordmark that went to the tab you were already
 * on, and two actions that also live in the profile — 54px of the shortest
 * viewport we have, spent on nothing that was not reachable another way. So it
 * is desktop-only now: the `hidden lg:block` sits on the `<header>` itself
 * rather than on each row inside it, which keeps the desktop bar byte-identical
 * and leaves nothing at all in the mobile layout to reason about.
 */
export default function TopBar({
  variant = "brand",
  title,
  onBack,
  onPostAd,
  onExit,
  exitHref,
  exitLabel = "Home",
}) {
  const { can } = useAccount();
  const { signedIn } = useAuth();
  // Real unread count from GET /api/v1/me/notifications/unread-count, same
  // endpoint Notifications.jsx's list ultimately agrees with. Best-effort:
  // a failed fetch just leaves the dot off rather than blocking the bar, and
  // there is nothing to poll for while signed out.
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setHasUnread(false);
      return;
    }
    let cancelled = false;
    getUnreadCount()
      .then((count) => {
        if (!cancelled) setHasUnread(count.count > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
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

          {/* The other creator entry point, and the one that survives on a
              phone now that the brand bar does not. The shell refuses this
              click for a browsing account anyway, but a button whose only
              outcome is a toast saying you may not is a button that should not
              have been drawn — so it is gated here rather than there. The bar
              is still back-arrow plus title without it, which is all a browsing
              account needs from this screen. */}
          {can("ad.create") && (
            <button
              onClick={onPostAd}
              className="shrink-0 rounded-full bg-brand-soft px-4 py-2 text-[14px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
            >
              Post
            </button>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="glass sticky top-0 z-30 hidden shrink-0 px-4 py-2.5 lg:block lg:px-6 lg:py-3.5">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
        {/* A site you have to leave deliberately (Personals) puts the way out
            in this slot. The third branch used to be a wordmark tagged
            `lg:hidden`, which inside a bar that now starts at `lg` could never
            paint again; at this width the rail already carries the wordmark, so
            the slot is the exit or it is nothing and the title takes the room. */}
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
        ) : null}
        <h1 className="hidden min-w-0 flex-1 truncate text-[22px] font-extrabold text-ink lg:block">
          {title}
        </h1>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/profile/notifications"
            aria-label={hasUnread ? "Notifications (unread)" : "Notifications"}
            className="relative grid size-10 place-items-center rounded-full bg-surface text-ink shadow-card transition-transform hover:scale-105 active:scale-95"
          >
            <Bell className="size-[19px]" strokeWidth={2.1} />
            {/* Colour- and position-only, so the label states it in words
                too rather than only showing it — both now follow the same
                `hasUnread` read, not a dot that was always on. */}
            {hasUnread && (
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-red-500 ring-2 ring-surface" />
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
