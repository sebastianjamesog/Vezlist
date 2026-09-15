"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Flag, MapPin, ShieldCheck, UserRoundX } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ListingCard from "../components/cards/ListingCard";
import ReportDialog from "../components/ReportDialog";
import MediaImage from "../components/media/MediaImage.jsx";
import { useReports } from "../context/ReportsContext";
import { useToast } from "../context/ToastContext";
import { listings, sellers } from "../data/mock";
import { FEED_PATH } from "../lib/sites";

/**
 * Who is behind an ad, and the two things a reader can do about them.
 *
 * The stats row used to be three numbers: ads, a star rating and a review
 * count. Two of them are gone. Reviews are not shipping (#29 closed
 * not-planned), so "4.8 ★" and "12 reviews" were seeded figures wearing the
 * clothes of a trust signal — the single most misleading thing that can sit on
 * a stranger's profile on a board where people arrange to meet. The response
 * time under the location went the same way: it described how fast this seller
 * replies to messages, and there is no messaging in this product (#2 closed
 * not-planned). What is left is what the data can actually support.
 *
 * Reporting and blocking arrived with it (#4). They are deliberately not the
 * same weight: Report is a text button, Block is a text button, and the ads
 * are still the page. A profile that leads with two safety controls reads as a
 * warning about the person it is describing.
 */
export default function SellerProfile() {
  const { id } = useParams();
  const seller = sellers[id];
  const { isBlocked, block, unblock, reportOf } = useReports();
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

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

  const blocked = isBlocked(seller.id);
  const reported = reportOf("user", seller.id);

  return (
    <>
      <SubPageBar
        title={seller.name}
        subtitle={`Member since ${seller.since}`}
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <section className="rounded-card bg-surface p-5 shadow-card lg:p-6">
          <div className="flex items-center gap-4">
            <span className="relative size-20 shrink-0 lg:size-24">
              <MediaImage
                fill
                src={seller.avatar}
                alt={seller.name}
                sizes="(min-width: 1024px) 96px, 80px"
                className="rounded-full object-cover"
              />
            </span>
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
              {/*
                One number, not three. "Ads" is the only one of the old trio
                that is counted from something real — the rows below this line
                — so it is the only one that stays, and it stops pretending to
                be a dashboard by dropping the divided grid it used to sit in.
              */}
              <p className="mt-1 text-[14px] text-muted">
                {theirAds.length} {theirAds.length === 1 ? "ad" : "ads"} on the
                board
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="flex items-center gap-1.5 text-[14px] font-semibold text-muted transition-colors hover:text-ink"
            >
              <Flag className="size-4" strokeWidth={2.2} />
              {reported ? "Reported" : "Report seller"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (blocked) {
                  unblock(seller.id);
                  toast(`${seller.name} unblocked`);
                } else {
                  setConfirmBlock(true);
                }
              }}
              className={`flex items-center gap-1.5 text-[14px] font-semibold transition-colors ${
                blocked ? "text-brand" : "text-muted hover:text-danger"
              }`}
            >
              <UserRoundX className="size-4" strokeWidth={2.2} />
              {blocked ? "Unblock" : "Block seller"}
            </button>
          </div>
        </section>

        {/*
          A blocked seller's ads are gone from the feed, so leaving them on
          display here would make the block look like it had not taken. The
          profile still opens — a direct link to it has to land somewhere, and
          "you blocked this person" is the answer — but it shows the state, not
          the ads.
        */}
        {blocked ? (
          <div className="mt-6">
            <EmptyState
              icon="Lock"
              title={`You blocked ${seller.name}`}
              body="Their ads are hidden from your feed. Unblock above to see them again."
            />
          </div>
        ) : (
          <>
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
          </>
        )}
      </PageBody>

      <ReportDialog
        open={reporting}
        targetType="user"
        targetId={seller.id}
        targetLabel={seller.name}
        onClose={() => setReporting(false)}
      />

      <ConfirmDialog
        open={confirmBlock}
        title={`Block ${seller.name}?`}
        body="Their ads stop appearing in your feed on this device. It takes effect straight away and you can undo it from this page or from Account Settings. Blocking is not a report — if something here is against the rules, report it too."
        confirmLabel="Block"
        destructive
        onConfirm={() => {
          setConfirmBlock(false);
          block(seller.id, seller.name);
          toast(`${seller.name} blocked — their ads are hidden`);
        }}
        onClose={() => setConfirmBlock(false)}
      />
    </>
  );
}
