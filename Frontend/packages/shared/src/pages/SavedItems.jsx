"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import ListingCard from "../components/cards/ListingCard";
import { useSaved } from "../context/SavedStore";
import { useToast } from "../context/ToastContext";
import { FEED_PATH } from "../lib/sites";

function SavedListingCard({ listing, pending, onRemove }) {
  return (
    <article>
      <ListingCard listing={listing} />
      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        aria-label={`Remove ${listing.title} from saved items`}
        aria-busy={pending}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-[13px] font-semibold text-red-500 shadow-card transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50"
      >
        <Heart className="size-4 fill-current" aria-hidden="true" />
        {pending ? "Removing..." : "Remove from saved"}
      </button>
    </article>
  );
}

export default function SavedItems() {
  const {
    items,
    count,
    countKnown,
    loading,
    loadingMore,
    error,
    hasMore,
    retry,
    loadMore,
    setSaved,
    isPending,
  } = useSaved();
  const toast = useToast();

  async function remove(listing) {
    try {
      await setSaved(listing.id, false);
      toast("Removed from saved");
    } catch (requestError) {
      toast(requestError.message ?? "Could not remove this saved ad.");
    }
  }

  const subtitle = loading
    ? "Loading saved ads..."
    : countKnown
      ? `${count} ${count === 1 ? "ad" : "ads"}`
      : "Your saved ads";

  return (
    <>
      <SubPageBar title="Saved Items" subtitle={subtitle} fallback="/profile" />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        {loading ? (
          <div
            role="status"
            className="rounded-card bg-surface px-6 py-16 text-center text-[14px] text-muted shadow-card"
          >
            Loading your saved ads...
          </div>
        ) : error && !items.length ? (
          <EmptyState
            icon="WifiOff"
            title="Could not load saved items"
            body={error.message}
            action={<Button onClick={retry}>Try again</Button>}
          />
        ) : items.length ? (
          <>
            {error && (
              <div
                role="alert"
                className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-[13px] text-danger"
              >
                <span>{error.message}</span>
                <button
                  type="button"
                  onClick={retry}
                  className="font-bold underline"
                >
                  Try again
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
              {items.map((listing) => (
                <SavedListingCard
                  key={listing.id}
                  listing={listing}
                  pending={isPending(listing.id)}
                  onRemove={() => remove(listing)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-5 flex justify-center">
                <Button onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon="Heart"
            title="Nothing saved yet"
            body="Save an active ad to keep it here. Ads that become unavailable are removed automatically."
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
