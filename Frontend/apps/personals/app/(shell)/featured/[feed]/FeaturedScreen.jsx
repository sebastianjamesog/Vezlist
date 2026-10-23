"use client";

import { useCallback, useEffect, useState } from "react";
import SubPageBar from "@vezlist/shared/components/layout/SubPageBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import { featuredListings } from "@vezlist/shared/lib/api/featured.js";
import { useAdPopup } from "@vezlist/shared/components/AdPopup.jsx";
import TrendingCard from "./TrendingCard.jsx";

const PHOTO_GRID =
  "grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5";

export default function FeaturedScreen({ title, feed }) {
  const viewer = useAdPopup();
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const trending = feed === "TRENDING";
  const newToday = feed === "NEW_TODAY";
  const available = feed === "AVAILABLE_NOW";

  const refresh = useCallback(async () => {
    try {
      setPage(await featuredListings(feed, { all: trending || available }));
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [feed, trending, available]);

  useEffect(() => {
    if (viewer.isOpen) return;
    if (!page || page.feed !== feed) refresh();
    const timer = setInterval(refresh, available ? 15_000 : 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, available, viewer.isOpen]);

  useEffect(() => {
    if (!available) return undefined;
    const deadline = Math.min(...(page?.items ?? []).map(item => Date.parse(item.availableUntil)).filter(value => value > Date.now()));
    if (!Number.isFinite(deadline)) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, deadline - Date.now()) + 20);
    return () => clearTimeout(timer);
  }, [available, page, now]);
  const loadedItems = page?.items ?? [];
  const items = available ? loadedItems.filter(item => item.availableNow && Date.parse(item.availableUntil) > now) : loadedItems;
  const availableTotal = Math.max(items.length, (page?.total ?? 0) - (loadedItems.length - items.length));
  const openAd = (id) =>
    viewer.open(
      id,
      items.map((item) => item.id),
      { mode: trending ? "vertical" : "detail" },
    );
  const subtitle = available
    ? "Advertisers available now"
    : newToday
      ? "Featured ads from the last 24 hours"
      : "Most viewed & liked creators";
  const emptyTitle = available
    ? "No advertisers available right now"
    : newToday
      ? "No new ads in this rotation"
      : "No trending creators yet";
  const emptyBody = available
    ? "Advertisers with active Personals ads appear here when they switch on Available Now."
    : newToday
      ? "Newly posted ads will appear here. You can also find all active ads in Browse."
      : "Creators will appear here as their ads receive views and saves.";

  return (
    <>
      <SubPageBar title={title} subtitle={subtitle} fallback="/" />
      <PageBody className="px-4 pb-8 lg:px-8">
        {available && availableTotal > items.length && (
          <p className="mb-3 text-sm text-muted">
            Showing {items.length} of {availableTotal} available ads.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-card bg-surface p-4 text-sm text-danger shadow-card"
          >
            Could not load {title}.{" "}
            <button
              type="button"
              onClick={refresh}
              className="font-bold underline focus-visible:outline-2 focus-visible:outline-brand"
            >
              Retry
            </button>
          </div>
        )}
        {!page && !error ? (
          <div role="status" aria-label={`Loading ${title.toLowerCase()}`}>
            <span className="sr-only">Loading {title.toLowerCase()}...</span>
            <div className={PHOTO_GRID} aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => (
                <div
                  key={index}
                  className="aspect-[4/5] rounded-lg bg-line motion-safe:animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : items.length ? (
          <div className={PHOTO_GRID}>
            {items.map((listing, index) => (
              <TrendingCard
                key={listing.id}
                listing={listing}
                rank={index + 1}
                onOpen={openAd}
              />
            ))}
          </div>
        ) : !error ? (
          <EmptyState
            icon={available ? "SearchX" : newToday ? "Sparkles" : "TrendingUp"}
            title={emptyTitle}
            body={emptyBody}
            action={<Button to="/">Browse all ads</Button>}
          />
        ) : null}
      </PageBody>
      {viewer.popup}
    </>
  );
}
