"use client";

import { useCallback, useEffect, useState } from "react";
import SubPageBar from "@vezlist/shared/components/layout/SubPageBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import ListingCard from "@vezlist/shared/components/cards/ListingCard.jsx";
import { featuredListings } from "@vezlist/shared/lib/api/featured.js";
import TrendingCard from "./TrendingCard.jsx";

const TRENDING_GRID = "grid grid-cols-3 gap-1.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

function toCard(row) {
  return {
    id: row.id,
    title: row.title,
    business: row.businessName,
    category: row.categoryLabel,
    province: row.provinceLabel,
    location: row.locationLabel,
    price: Number(row.price ?? 0),
    views: row.viewCount,
    site: row.site,
    verified: row.verified,
    postedMsAgo: row.publishedAt ? Date.now() - new Date(row.publishedAt).getTime() : null,
    image: row.imageUrl,
  };
}

export default function FeaturedScreen({ title, feed }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);
  const trending = feed === "TRENDING";

  const refresh = useCallback(async () => {
    try {
      setPage(await featuredListings(feed, { all: trending }));
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [feed, trending]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const cards = page?.items.map(toCard) ?? [];
  if (trending) {
    return (
      <>
        <SubPageBar title={title} subtitle="Most viewed & liked creators" fallback="/" />
        <PageBody className="px-4 pb-8 lg:px-8">
          {error && (
            <div role="alert" className="mb-3 rounded-card bg-surface p-4 text-sm text-danger shadow-card">
              Could not load Trending. <button type="button" onClick={refresh} className="font-bold underline focus-visible:outline-2 focus-visible:outline-brand">Retry</button>
            </div>
          )}
          {!page && !error ? (
            <div role="status" aria-label="Loading trending creators">
              <span className="sr-only">Loading trending creators…</span>
              <div className={TRENDING_GRID} aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => <div key={index} className="aspect-[4/5] rounded-lg bg-line motion-safe:animate-pulse" />)}
              </div>
            </div>
          ) : page?.items.length ? (
            <div className={TRENDING_GRID}>
              {page.items.map((listing, index) => <TrendingCard key={listing.id} listing={listing} rank={index + 1} />)}
            </div>
          ) : !error ? (
            <EmptyState icon="TrendingUp" title="No trending creators yet" body="Creators will appear here as their ads receive views and saves." action={<Button to="/">Browse all ads</Button>} />
          ) : null}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <SubPageBar title={title} subtitle="Rotating featured slots" fallback="/" />
      <PageBody className="px-4 pb-8 lg:px-8">
        <p className="mb-4 text-sm text-muted">This feed rotates every 15 minutes. Ads not in a featured slot remain in normal Browse, and creators who are live also appear independently in Live Now.</p>
        {error && <div role="alert" className="mb-4 rounded-card bg-surface p-4 text-sm text-danger shadow-card">Could not load {title}. <button type="button" onClick={refresh} className="font-bold underline">Retry</button></div>}
        {!page && !error ? <p role="status" className="text-sm text-muted">Loading featured ads…</p> : cards.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">{cards.map((listing) => <ListingCard key={listing.id} listing={listing} chevron />)}</div>
        ) : <EmptyState icon="SearchX" title={`No ${title.toLowerCase()} slots right now`} body="There are no eligible ads in this rotation. All active ads remain available in Browse." action={<Button to="/">Browse all ads</Button>} />}
      </PageBody>
    </>
  );
}
