"use client";

import Link from "next/link";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import ListingCard from "../components/cards/ListingCard";
import { useSaved } from "../context/SavedContext";
import { useToast } from "../context/ToastContext";
import { ads, listings } from "../data/mock";
import { FEED_PATH } from "../lib/sites";

export default function SavedItems() {
  const { ids, remove, count } = useSaved();
  const toast = useToast();

  // Saved ids point at ad pages; show the matching feed listing where there is one.
  const items = ids
    .map((id) => ({
      id,
      ad: ads[id],
      listing: listings.find((l) => l.adId === id),
    }))
    .filter((x) => x.ad);

  return (
    <>
      <SubPageBar
        title="Saved Items"
        subtitle={`${count} ${count === 1 ? "ad" : "ads"}`}
        fallback="/profile"
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        {items.length ? (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {items.map(({ id, ad, listing }) =>
              listing ? (
                <ListingCard key={id} listing={listing} />
              ) : (
                <Link
                  key={id}
                  href={`/ad/${id}`}
                  className="flex gap-3 rounded-card bg-surface p-3 shadow-card transition-shadow hover:shadow-lift"
                >
                  <img
                    src={ad.photos[0]}
                    alt=""
                    loading="lazy"
                    className="size-[72px] shrink-0 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-bold leading-tight text-ink">
                      {ad.title}
                    </h3>
                    <p className="mt-1 text-[15px] font-bold text-brand">
                      ${ad.price.toLocaleString()}
                    </p>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        remove(id);
                        toast("Removed from saved");
                      }}
                      className="mt-1 text-[13px] font-semibold text-muted hover:text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                </Link>
              ),
            )}
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
