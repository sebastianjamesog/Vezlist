"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock, MapPin, MessageSquare, ShieldCheck, Star } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import ListingCard from "../components/cards/ListingCard";
import { useToast } from "../context/ToastContext";
import { listings, sellers } from "../data/mock";
import { FEED_PATH } from "../lib/sites";

export default function SellerProfile() {
  const { id } = useParams();
  const toast = useToast();
  const seller = sellers[id];

  if (!seller) {
    return (
      <>
        <SubPageBar title="Seller" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">
            That seller doesn't exist.
          </p>
          <Link
            href={FEED_PATH}
            className="text-[15px] font-semibold text-brand"
          >
            Back to listings
          </Link>
        </div>
      </>
    );
  }

  const theirAds = seller.listingIds
    .map((lid) => listings.find((l) => l.id === lid))
    .filter(Boolean);

  return (
    <>
      <SubPageBar
        title={seller.name}
        subtitle={`Member since ${seller.since}`}
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <section className="rounded-card bg-surface p-5 shadow-card lg:p-6">
          <div className="flex items-center gap-4">
            <img
              src={seller.avatar}
              alt={seller.name}
              className="size-20 shrink-0 rounded-full object-cover lg:size-24"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[22px] font-bold leading-tight text-ink">
                  {seller.name}
                </h2>
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-semibold text-amber-700">
                  <ShieldCheck className="size-3.5" />
                  {seller.badge}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-[14px] text-muted">
                <MapPin className="size-4" />
                {seller.location}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[14px] text-muted">
                <Clock className="size-4" />
                {seller.responseTime}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-3 divide-x divide-line border-t border-line pt-4 text-center">
            <div>
              <dd className="text-[20px] font-bold text-brand">
                {theirAds.length}
              </dd>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Ads
              </dt>
            </div>
            <div>
              <dd className="flex items-center justify-center gap-1 text-[20px] font-bold text-brand">
                <Star className="size-4 fill-amber-400 text-amber-400" />
                {seller.rating}
              </dd>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Rating
              </dt>
            </div>
            <div>
              <dd className="text-[20px] font-bold text-brand">
                {seller.reviews}
              </dd>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Reviews
              </dt>
            </div>
          </dl>

          <button
            onClick={() => toast(`Message sent to ${seller.name}`)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-[16px] font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <MessageSquare className="size-5" />
            Message seller
          </button>
        </section>

        <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
          Ads by {seller.name}
        </h2>
        {theirAds.length ? (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {theirAds.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="Megaphone"
            title="No live ads"
            body="This seller has nothing posted right now."
          />
        )}
      </PageBody>
    </>
  );
}
