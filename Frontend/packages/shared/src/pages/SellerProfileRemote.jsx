"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, MessageSquare, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import ListingCard from "../components/cards/ListingCard";
import { api } from "../lib/api";
import { discoveryListingToCard } from "../lib/discovery";
import { FEED_PATH, SITE } from "../lib/sites";

function memberSince(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "recently";
}

export default function SellerProfileRemote() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, page: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, page: null, error: null });
    api(`/sellers/${id}?site=${SITE.toUpperCase()}`, { signal: controller.signal })
      .then((page) => setState({ loading: false, page, error: null }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ loading: false, page: null, error });
      });
    return () => controller.abort();
  }, [id]);

  if (state.loading) return <><SubPageBar title="Seller" /><PageBody className="p-6 text-muted">Loading seller...</PageBody></>;
  if (!state.page) return <><SubPageBar title="Seller" /><div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><p className="text-[18px] font-bold text-ink">That seller is no longer available.</p><Link href={FEED_PATH} className="text-[15px] font-semibold text-brand">Back to listings</Link></div></>;

  const { seller, activeListingCount, items } = state.page;
  const cards = (items ?? []).map(discoveryListingToCard);
  return <>
    <SubPageBar title={seller.displayName} subtitle={`Member since ${memberSince(seller.memberSince)}`} />
    <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
      <section className="rounded-card bg-surface p-5 shadow-card lg:p-6">
        <div className="flex items-center gap-4">
          {seller.avatarUrl ? <img src={seller.avatarUrl} alt={seller.displayName} className="size-20 shrink-0 rounded-full object-cover lg:size-24" /> : <span className="grid size-20 shrink-0 place-items-center rounded-full bg-brand-soft text-[28px] font-bold text-brand lg:size-24">{seller.displayName?.[0]?.toUpperCase() ?? "V"}</span>}
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-[22px] font-bold text-ink">{seller.displayName}</h2>{seller.verified && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-semibold text-amber-700"><ShieldCheck className="size-3.5" />Verified seller</span>}</div><p className="mt-2 flex items-center gap-1.5 text-[14px] text-muted"><Clock className="size-4" />{seller.responseTime ?? "Response time not available"}</p></div>
        </div>
        <dl className="mt-5 border-t border-line pt-4 text-center"><dd className="text-[20px] font-bold text-brand">{activeListingCount}</dd><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Active ads</dt></dl>
        <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3.5 text-[15px] font-semibold text-muted"><MessageSquare className="size-5" />Contact details are shown on each ad</p>
      </section>
      <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Ads by {seller.displayName}</h2>
      {cards.length ? <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">{cards.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div> : <EmptyState icon="Megaphone" title="No live ads" body="This seller has nothing posted right now." />}
    </PageBody>
  </>;
}
