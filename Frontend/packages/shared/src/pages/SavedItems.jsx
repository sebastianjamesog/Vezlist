"use client";

import Link from "next/link";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import ListingCard from "../components/cards/ListingCard";
import { useSaved } from "../context/SavedContext";
import { FEED_PATH } from "../lib/sites";

/**
 * A `SavedListingResponse` row (see `lib/api/saved.js`) shaped the way
 * `ListingCard` expects a row — `SavedListingPageResponse` already carries
 * everything the card renders, so this is a field rename, not a fetch.
 */
function toCardListing(row) {
  return {
    id: row.id,
    title: row.title,
    business: row.businessName,
    category: row.categoryLabel,
    location: row.locationLabel,
    province: row.provinceLabel,
    price: row.price,
    verified: row.verified,
    postedMsAgo: row.publishedAt
      ? Date.now() - new Date(row.publishedAt).getTime()
      : null,
    image: row.imageUrl,
  };
}

export default function SavedItems() {
  const { rows, ready, error, retry, count } = useSaved();

  const items = rows.map((row) => ({ row, listing: toCardListing(row) }));

  return (
    <>
      <SubPageBar
        title="Saved Items"
        subtitle={ready ? `${count} ${count === 1 ? "ad" : "ads"}` : "Loading…"}
        fallback="/profile"
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        {!ready ? (
          // Skeleton, not blank: three fixed-height placeholder rows in the
          // same grid the real cards render into, so the layout does not
          // jump the instant the list answers.
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[122px] animate-pulse rounded-2xl bg-surface shadow-card lg:h-[136px]"
              />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon="TriangleAlert"
            title="Couldn't load your saved ads"
            body={error.message || "Something went wrong. Please try again."}
            action={
              <button
                type="button"
                onClick={retry}
                className="mt-1 rounded-xl brand-gradient px-5 py-2.5 text-[15px] font-bold text-on-brand shadow-pop transition-transform active:scale-95"
              >
                Retry
              </button>
            }
          />
        ) : items.length ? (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {items.map(({ row, listing }) => (
              <ListingCard key={row.id} listing={listing} chevron />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="Heart"
            title="Nothing saved yet"
            body="Tap the heart on any ad to keep it here for later."
            action={
              <Link
                href={FEED_PATH}
                className="mt-1 rounded-xl brand-gradient px-5 py-2.5 text-[15px] font-bold text-on-brand shadow-pop transition-transform active:scale-95"
              >
                Browse ads
              </Link>
            }
          />
        )}
      </PageBody>
    </>
  );
}
