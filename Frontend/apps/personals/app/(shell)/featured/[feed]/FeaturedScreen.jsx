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

  const items = page?.items ?? [];
  const openAd = (id) =>
    viewer.open(
      id,
      items.map((item) => item.id),
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
        {available && page?.total > items.length && (
          <p className="mb-3 text-sm text-muted">
            Showing {items.length} of {page.total} available ads.
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
